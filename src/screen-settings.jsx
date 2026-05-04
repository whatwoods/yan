// screen-settings.jsx — Settings page with persona, theme, data, AI, WebDAV, master password, categories.

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { TOKENS } from './tokens.jsx';
import { ICONS } from './icons.jsx';
import { ScrHead, showToast } from './components.jsx';
import { Store, DEFAULT_CATEGORIES, addNoteToIndex, updateNoteInIndex } from './store.jsx';
import { initWebDAV, testConnection, syncAll } from './sync.js';
import { SecretsStore } from './crypto.js';
import { getMeta, setMeta } from './db.js';
import { PROVIDERS, TASK_LABELS, fetchModels as aiFetchModels, getModelAssignment, isAIConfigured } from './ai.js';
import { Section, Row, PickerSheet, PersonaSheet, FontSheet, inputStyle } from './settings-components.jsx';
import { MasterPasswordSheet, UnlockSheet } from './settings-security.jsx';

export function SettingsScreen({ settings, onChange, onResetSeed, persona, onExport, onClearAll, totalNotes, onNavigate, installPrompt, onAIConfigChange }) {
  const T = TOKENS, I = ICONS;

  const [showPersona, setShowPersona] = useState(false);
  const [showFont, setShowFont] = useState(false);

  // AI config state
  const [aiConfig, setAiConfig] = useState({ provider: 'deepseek', endpoint: '', apiKey: '', models: [], defaultModel: '' });
  const [aiTesting, setAiTesting] = useState(false);
  const [aiModels, setAiModels] = useState([]);
  const [modelAssignment, setModelAssignment] = useState({ classify: '', tag: '', summarize: '', insight: '', ask: '', curator: '' });
  const [showProviderPicker, setShowProviderPicker] = useState(false);
  const [showDefaultModelPicker, setShowDefaultModelPicker] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(null); // task key or null

  // WebDAV config state
  const [webdavConfig, setWebdavConfig] = useState({ server: '', username: '', password: '' });
  const [webdavTesting, setWebdavTesting] = useState(false);
  const [webdavStatus, setWebdavStatus] = useState(null); // { lastSync, syncing }

  // Master password state
  const [masterPasswordSet, setMasterPasswordSet] = useState(false);
  const [showMasterPwSheet, setShowMasterPwSheet] = useState(false);
  const [secretsUnlocked, setSecretsUnlocked] = useState(false);
  const [showUnlockSheet, setShowUnlockSheet] = useState(false);

  // Categories state
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [showCatSheet, setShowCatSheet] = useState(false);
  const [editingCat, setEditingCat] = useState(null); // null = adding new

  const secretsLocked = masterPasswordSet && !secretsUnlocked;

  // Load persisted configs from meta on mount
  useEffect(() => {
    (async () => {
      try {
        const [savedAi, savedWebdav, savedCats, savedLastSync, hasPw, savedAssignment] = await Promise.all([
          getMeta('aiConfig'),
          getMeta('webdavConfig'),
          getMeta('categories'),
          getMeta('lastSync'),
          SecretsStore.isSetup(),
          getModelAssignment(),
        ]);
        if (savedAi) {
          const hydrated = { ...savedAi, apiKey: savedAi.apiKey || SecretsStore.get('apiKey') || '' };
          setAiConfig(prev => ({ ...prev, ...hydrated }));
          setAiModels(hydrated.models || []);
          onAIConfigChange?.(hydrated, savedAssignment);
        }
        if (savedAssignment) setModelAssignment(savedAssignment);
        if (savedWebdav) {
          setWebdavConfig(prev => ({ ...prev, ...savedWebdav, password: savedWebdav.password || '' }));
          // Skip initWebDAV when password is encrypted but not yet unlocked
          if (savedWebdav.server && savedWebdav.username && !(hasPw && !SecretsStore.isUnlocked())) {
            initWebDAV(savedWebdav);
          }
        }
        if (hasPw) {
          setMasterPasswordSet(true);
          // Try auto-unlock with cached session (won't work on fresh load, but no harm)
          if (SecretsStore.isUnlocked()) {
            setSecretsUnlocked(true);
          }
        }
        if (savedCats) setCategories(savedCats);
        if (savedLastSync) setWebdavStatus({ lastSync: savedLastSync });
      } catch {}
    })();
  }, []);

  const deletedCount = useMemo(() =>
    Store.getAllNotesWithDeleted().filter((n) => n.deleted_at).length, []
  );

  // ── AI config handlers ──────────────────────────────────────
  const saveAiConfig = useCallback(async (config) => {
    setAiConfig(config);
    const models = config.models || [];
    setAiModels(models);
    if (masterPasswordSet && secretsUnlocked) {
      // Encrypt API key via SecretsStore; store config without it
      await SecretsStore.update({
        apiKey: config.apiKey,
        webdavPassword: SecretsStore.get('webdavPassword') || '',
      });
      const { apiKey, ...safe } = config;
      await setMeta('aiConfig', safe);
    } else if (masterPasswordSet) {
      const { apiKey, ...safe } = config;
      await setMeta('aiConfig', safe);
    } else {
      await setMeta('aiConfig', config);
    }
    onAIConfigChange?.(config, modelAssignment);
  }, [masterPasswordSet, secretsUnlocked, modelAssignment, onAIConfigChange]);

  const handleAiTest = useCallback(async () => {
    setAiTesting(true);
    setAiModels([]);
    try {
      const endpoint = aiConfig.endpoint || PROVIDERS.find(p => p.id === aiConfig.provider)?.endpoint || '';
      if (!endpoint || !aiConfig.apiKey) {
        showToast('请填写端点和密钥');
        return;
      }
      const models = await aiFetchModels(endpoint, aiConfig.apiKey);
      if (models.length > 0) {
        setAiModels(models);
        const updated = { ...aiConfig, models, defaultModel: aiConfig.defaultModel || models[0] };
        await saveAiConfig(updated);
        showToast(`连接成功 · ${models.length} 个模型`);
      } else {
        showToast('连接失败: 未获取到模型列表');
      }
    } catch (e) {
      showToast('连接失败: ' + (e.message || '网络错误'));
    } finally {
      setAiTesting(false);
    }
  }, [aiConfig, saveAiConfig]);

  // ── WebDAV config handlers ──────────────────────────────────
  const saveWebdavConfig = useCallback(async (config) => {
    setWebdavConfig(config);
    if (masterPasswordSet && secretsUnlocked) {
      await SecretsStore.update({
        apiKey: SecretsStore.get('apiKey') || '',
        webdavPassword: config.password,
      });
      const { password, ...safe } = config;
      await setMeta('webdavConfig', safe);
    } else if (masterPasswordSet) {
      const { password, ...safe } = config;
      await setMeta('webdavConfig', safe);
    } else {
      await setMeta('webdavConfig', config);
    }
    if (config.server && config.username && (!masterPasswordSet || secretsUnlocked)) {
      initWebDAV(config);
    }
  }, [masterPasswordSet, secretsUnlocked]);

  const handleWebdavTest = useCallback(async () => {
    if (secretsLocked) {
      setShowUnlockSheet(true);
      return;
    }
    setWebdavTesting(true);
    try {
      const result = await testConnection(webdavConfig);
      if (result.ok) {
        showToast('连接成功');
      } else {
        showToast('连接失败: ' + (result.error || '未知错误'));
      }
    } catch (e) {
      showToast('连接失败: ' + e.message);
    } finally {
      setWebdavTesting(false);
    }
  }, [webdavConfig, secretsLocked]);

  const handleSync = useCallback(async () => {
    if (secretsLocked) {
      setShowUnlockSheet(true);
      return;
    }
    if (!webdavConfig.server) {
      showToast('请先配置 WebDAV');
      return;
    }
    setWebdavStatus(prev => ({ ...prev, syncing: true }));
    try {
      initWebDAV(webdavConfig);
      const allNotes = Store.getAllCachedNotes();
      // Collect extra data for non-note sync
      const insights = new Map();
      const now = new Date();
      const insightKey = `insight:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const savedInsight = await getMeta(insightKey);
      if (savedInsight?.text) {
        insights.set(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`, savedInsight.text);
      }
      const result = await syncAll(allNotes, {
        categories,
        insights,
        preferences: settings,
      });
      // Apply upserted remote notes to in-memory Store and search index
      if (result.upserted && result.upserted.length > 0) {
        for (const remote of result.upserted) {
          const idx = Store._notes.findIndex((n) => n.id === remote.id);
          if (idx !== -1) {
            Store._notes[idx] = remote;
            updateNoteInIndex(remote);
          } else {
            Store._notes.push(remote);
            addNoteToIndex(remote);
          }
        }
      }
      const syncNow = new Date().toISOString();
      await setMeta('lastSync', syncNow);
      setWebdavStatus({ lastSync: syncNow, syncing: false, conflicts: result.conflicts.length });
      showToast(`同步完成: ${result.synced} 条`);
      if (result.conflicts.length > 0) {
        showToast(`${result.conflicts.length} 条冲突已保存到 /yan/conflicts/`);
      }
    } catch (e) {
      setWebdavStatus(prev => ({ ...prev, syncing: false }));
      showToast('同步失败: ' + e.message);
    }
  }, [webdavConfig, categories, settings, secretsLocked]);

  // ── Master password handlers ────────────────────────────────
  const handleSetMasterPassword = useCallback(async (password) => {
    if (masterPasswordSet && !secretsUnlocked) {
      setShowMasterPwSheet(false);
      setShowUnlockSheet(true);
      return false;
    }
    if (password.length < 8) {
      showToast('密码至少 8 位');
      return false;
    }
    try {
      // Collect current plaintext secrets
      const secrets = {
        apiKey: aiConfig.apiKey || '',
        webdavPassword: webdavConfig.password || '',
      };
      // Encrypt and store via SecretsStore
      await SecretsStore.setup(password, secrets);
      // Strip plaintext from stored configs
      if (aiConfig.apiKey) {
        const { apiKey, ...safe } = aiConfig;
        await setMeta('aiConfig', safe);
      }
      if (webdavConfig.password) {
        const { password: _, ...safe } = webdavConfig;
        await setMeta('webdavConfig', safe);
      }
      await setMeta('masterPasswordSet', true);
      setMasterPasswordSet(true);
      setSecretsUnlocked(true);
      setShowMasterPwSheet(false);
      showToast('主密码已设置 · 密钥已加密');
      return true;
    } catch (e) {
      showToast('设置失败: ' + e.message);
      return false;
    }
  }, [aiConfig, webdavConfig, masterPasswordSet, secretsUnlocked]);

  const handleUnlock = useCallback(async (password) => {
    const ok = await SecretsStore.unlock(password);
    if (!ok) {
      showToast('密码错误');
      return false;
    }
    setSecretsUnlocked(true);
    setShowUnlockSheet(false);
    // Populate local state with decrypted secrets
    const key = SecretsStore.get('apiKey');
    if (key) {
      setAiConfig(prev => {
        const next = { ...prev, apiKey: key };
        onAIConfigChange?.(next, modelAssignment);
        return next;
      });
    }
    const pw = SecretsStore.get('webdavPassword');
    if (pw) {
      setWebdavConfig(prev => {
        const next = { ...prev, password: pw };
        if (next.server && next.username) initWebDAV(next);
        return next;
      });
    }
    showToast('已解锁');
    return true;
  }, [modelAssignment, onAIConfigChange]);

  const handleClearMasterPassword = useCallback(async () => {
    if (!confirm('清除主密码？加密的密钥将同时删除，需要重新输入 API Key。')) return;
    await SecretsStore.clear();
    setMasterPasswordSet(false);
    setSecretsUnlocked(false);
    showToast('主密码已清除');
  }, []);

  // ── Category handlers ───────────────────────────────────────
  const saveCategories = useCallback(async (cats) => {
    setCategories(cats);
    await setMeta('categories', cats);
    await Store.saveCategories(cats);
  }, []);

  const handleSaveCategory = useCallback((catData) => {
    let updated;
    if (editingCat !== null && editingCat >= 0) {
      // Editing existing
      updated = categories.map((c, i) => i === editingCat ? catData : c);
    } else {
      // Adding new
      updated = [...categories, catData];
    }
    saveCategories(updated);
    setShowCatSheet(false);
    setEditingCat(null);
  }, [categories, editingCat, saveCategories]);

  const handleDeleteCategory = useCallback(async (index) => {
    const catName = categories[index].name;
    // 确定迁移目标：优先「想法」，若「想法」本身被删则取第一个默认分类
    const fallbackName = '想法';
    const migrateTo = catName === fallbackName
      ? (DEFAULT_CATEGORIES.find(c => c.name !== catName)?.name ?? categories.find((c, i) => i !== index)?.name)
      : fallbackName;
    if (!confirm(`删除分类「${catName}」？\n该分类下的笔记将移到「${migrateTo}」。`)) return;

    // 迁移该分类下的所有笔记
    const allNotes = Store.getAllCachedNotes();
    for (const note of allNotes) {
      if (note.category === catName) {
        await Store.updateNote(note.id, { category: migrateTo });
      }
    }

    const updated = categories.filter((_, i) => i !== index);
    saveCategories(updated);
  }, [categories, saveCategories]);

  return (
    <div className="screen paper">
      <ScrHead title="设置" />

      <div className="scroll" style={{ flex: 1, padding: '0 20px 30px' }}>
        {/* Profile */}
        <div className="card" style={{
          borderRadius: 14, padding: 14, marginBottom: 18,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <img
            src="icon-192.png"
            alt=""
            aria-hidden="true"
            style={{
              width: 48, height: 48, borderRadius: 12,
              objectFit: 'contain', flexShrink: 0,
              transform: 'rotate(-3deg)',
              filter: 'drop-shadow(0 3px 8px rgba(40, 28, 16, .18))',
            }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: T.fontSerif, fontSize: 16, color: 'var(--ink)', fontWeight: 600 }}>
              本地笔记
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-mute)' }}>
              {totalNotes} 篇 · 全部存于此设备
            </div>
          </div>
          <div style={{
            background: 'var(--paper-deep)', padding: '4px 8px', borderRadius: 6,
            fontSize: 11, color: 'var(--ink-mute)',
          }} className="mono">本地</div>
        </div>

        <Section title={`${persona.name} · AI 助手`}>
          <Row icon={persona.mark} accent={persona.color} label="人格"
            value={persona.desc} onClick={() => setShowPersona(true)} />
          <Row icon={<I.sparkle size={14} />} label="自动识别打标签"
            value={settings.autoTag ? '开' : '关'}
            onClick={() => onChange({ ...settings, autoTag: !settings.autoTag })} />
          <Row icon={<I.bolt size={14} />} label="云端模型"
            value={isAIConfigured(aiConfig, modelAssignment)
              ? (aiModels.length > 0 ? `${aiModels.length} 个模型` : '已配置')
              : '本地（离线）'} last />
        </Section>

        {/* AI Provider */}
        <Section title="AI 供应商">
          {masterPasswordSet && !secretsUnlocked ? (
            <Row icon={<I.pin size={14} />} label="密钥已加密"
              value="点击解锁" onClick={() => setShowUnlockSheet(true)} last />
          ) : (
            <>
              <Row icon={<I.globe size={14} />} label="供应商"
                value={PROVIDERS.find(p => p.id === aiConfig.provider)?.name || '未设置'}
                onClick={() => setShowProviderPicker(true)} />
              <div style={{ padding: '8px 14px', borderBottom: `1px solid var(--fold)` }}>
                <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginBottom: 4, fontFamily: T.fontSerif }}>端点</div>
                <input
                  type="text"
                  value={aiConfig.endpoint}
                  onChange={(e) => setAiConfig({ ...aiConfig, endpoint: e.target.value })}
                  onBlur={() => saveAiConfig(aiConfig)}
                  placeholder={PROVIDERS.find(p => p.id === aiConfig.provider)?.endpoint || 'https://...'}
                  style={inputStyle(T)}
                />
              </div>
              <div style={{ padding: '8px 14px', borderBottom: `1px solid var(--fold)` }}>
                <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginBottom: 4, fontFamily: T.fontSerif }}>API Key</div>
                <input
                  type="password"
                  value={aiConfig.apiKey}
                  onChange={(e) => setAiConfig({ ...aiConfig, apiKey: e.target.value })}
                  onBlur={() => saveAiConfig(aiConfig)}
                  placeholder="sk-..."
                  style={inputStyle(T)}
                />
              </div>
              <Row
                icon={<I.bolt size={14} />}
                label={aiTesting ? '测试中...' : '测试连接'}
                value={aiTesting ? '...' : '测试'}
                onClick={aiTesting ? undefined : handleAiTest}
              />
              {aiModels.length > 0 && (
                <Row
                  icon={<I.bolt size={14} />}
                  label="默认模型"
                  value={aiConfig.defaultModel || '未设置'}
                  onClick={() => setShowDefaultModelPicker(true)}
                  last
                />
              )}
            </>
          )}
        </Section>

        {/* Per-task model assignment */}
        {aiModels.length > 0 && (!masterPasswordSet || secretsUnlocked) ? (
          <Section title="任务模型分配">
            {Object.entries(TASK_LABELS).map(([key, label], idx, arr) => (
              <Row
                key={key}
                icon={<span style={{ fontSize: 11, color: 'var(--ink-mute)' }}>{label[0]}</span>}
                label={label}
                value={modelAssignment[key] || aiConfig.defaultModel || '默认'}
                onClick={() => setShowModelPicker(key)}
                last={idx === arr.length - 1}
              />
            ))}
          </Section>
        ) : null}

        {/* WebDAV Sync */}
        <Section title="WebDAV 同步">
          <div style={{ padding: '8px 14px', borderBottom: `1px solid var(--fold)` }}>
            <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginBottom: 4, fontFamily: T.fontSerif }}>服务器</div>
            <input
              type="text"
              value={webdavConfig.server}
              onChange={(e) => setWebdavConfig({ ...webdavConfig, server: e.target.value })}
              onBlur={() => saveWebdavConfig(webdavConfig)}
              placeholder="https://dav.example.com"
              style={inputStyle(T)}
            />
          </div>
          <div style={{ padding: '8px 14px', borderBottom: `1px solid var(--fold)` }}>
            <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginBottom: 4, fontFamily: T.fontSerif }}>用户名</div>
            <input
              type="text"
              value={webdavConfig.username}
              onChange={(e) => setWebdavConfig({ ...webdavConfig, username: e.target.value })}
              onBlur={() => saveWebdavConfig(webdavConfig)}
              placeholder="user"
              style={inputStyle(T)}
            />
          </div>
          {secretsLocked ? (
            <Row icon={<I.pin size={14} />} label="密码已加密"
              value="点击解锁" onClick={() => setShowUnlockSheet(true)} />
          ) : (
            <div style={{ padding: '8px 14px', borderBottom: `1px solid var(--fold)` }}>
              <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginBottom: 4, fontFamily: T.fontSerif }}>密码</div>
              <input
                type="password"
                value={webdavConfig.password}
                onChange={(e) => setWebdavConfig({ ...webdavConfig, password: e.target.value })}
                onBlur={() => saveWebdavConfig(webdavConfig)}
                placeholder="******"
                style={inputStyle(T)}
              />
            </div>
          )}
          <Row
            icon={<I.bolt size={14} />}
            label={webdavTesting ? '测试中...' : '测试连接'}
            value={webdavTesting ? '...' : '测试'}
            onClick={webdavTesting ? undefined : handleWebdavTest}
          />
          <Row
            icon={<I.globe size={14} />}
            label="同步状态"
            value={webdavStatus?.lastSync
              ? `上次: ${new Date(webdavStatus.lastSync).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
              : '从未同步'}
          />
          <Row
            icon={<I.send size={14} />}
            label={webdavStatus?.syncing ? '同步中...' : '立即同步'}
            value={webdavStatus?.syncing ? '...' : '同步'}
            onClick={webdavStatus?.syncing ? undefined : handleSync}
            last
          />
        </Section>

        {/* Master Password */}
        <Section title="主密码">
          <Row
            icon={<I.pin size={14} />}
            label={masterPasswordSet ? '修改主密码' : '设置主密码'}
            value={masterPasswordSet ? (secretsUnlocked ? '已解锁' : '已锁定') : '未设置'}
            onClick={() => {
              if (masterPasswordSet && !secretsUnlocked) {
                setShowUnlockSheet(true);
                return;
              }
              setShowMasterPwSheet(true);
            }}
          />
          {masterPasswordSet && (
            <Row
              icon={<I.trash size={14} />}
              label="清除主密码"
              value="删除加密"
              onClick={handleClearMasterPassword}
              last
            />
          )}
        </Section>

        {/* Categories */}
        <Section title="大分类">
          {categories.map((cat, idx) => (
            <Row
              key={cat.name}
              icon={<span style={{ width: 10, height: 10, borderRadius: '50%', background: cat.hex, display: 'inline-block' }} />}
              label={cat.name}
              value={cat.color}
              onClick={() => { setEditingCat(idx); setShowCatSheet(true); }}
              last={idx === categories.length - 1}
            />
          ))}
          <Row
            icon={<I.plus size={14} />}
            label="添加分类"
            value="+"
            onClick={() => { setEditingCat(null); setShowCatSheet(true); }}
            last
          />
        </Section>

        <Section title="外观">
          <Row icon={<I.pen size={14} />} label="字体"
            value={({ serif: '思源宋体', sans: '思源黑体', kai: '楷体' })[settings.font] || '思源宋体'}
            onClick={() => setShowFont(true)} />
          <Row icon={<I.book size={14} />} label="卡片密度"
            value={settings.density === 'compact' ? '紧凑' : '舒适'}
            onClick={() => onChange({ ...settings, density: settings.density === 'compact' ? 'comfy' : 'compact' })} last />
        </Section>

        <Section title="数据">
          <Row icon={<I.trash size={14} />} label="回收站"
            value={deletedCount > 0 ? `${deletedCount} 篇` : '空'}
            onClick={() => onNavigate?.('trash')} />
          <Row icon={<I.clip size={14} />} label="导出全部笔记"
            value="Markdown" onClick={onExport} />
          <Row icon={<I.bolt size={14} />} label="重置示例数据"
            value="覆盖" onClick={onResetSeed} />
          <Row icon={<I.trash size={14} />} label="清空所有数据"
            value="谨慎" accent="#a13a30"
            onClick={onClearAll} last />
        </Section>

        {installPrompt && (
          <Section title="应用">
            <button onClick={async () => {
              installPrompt.prompt();
              const { outcome } = await installPrompt.userChoice;
              if (outcome === 'accepted') showToast('正在安装…');
            }} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              width: '100%', padding: '12px 14px',
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontFamily: T.fontSerif, fontSize: 14, color: 'var(--seal)',
              borderBottom: 'none',
            }}>
              <span style={{
                width: 28, height: 28, borderRadius: 7,
                background: 'var(--seal-tint)', color: 'var(--seal)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 600, flexShrink: 0,
              }}>+</span>
              安装砚到桌面
            </button>
          </Section>
        )}

        <div style={{
          textAlign: 'center', padding: '20px 0 10px',
          fontFamily: T.fontMono, fontSize: 11, color: 'var(--ink-fade)',
        }}>砚 v1.0 · 会思考的笔记本</div>
      </div>

      {/* Bottom sheets */}
      {showPersona && (
        <PersonaSheet current={settings.persona} onPick={(p) => {
          onChange({ ...settings, persona: p });
          setShowPersona(false);
        }} onClose={() => setShowPersona(false)} />
      )}
      {showFont && (
        <FontSheet current={settings.font} onPick={(f) => {
          onChange({ ...settings, font: f });
          setShowFont(false);
        }} onClose={() => setShowFont(false)} />
      )}
      {showMasterPwSheet && (
        <MasterPasswordSheet
          isChange={masterPasswordSet}
          onSubmit={handleSetMasterPassword}
          onClose={() => setShowMasterPwSheet(false)}
        />
      )}
      {showUnlockSheet && (
        <UnlockSheet
          onSubmit={handleUnlock}
          onClose={() => setShowUnlockSheet(false)}
        />
      )}
      {showCatSheet && (
        <CategorySheet
          category={editingCat !== null && editingCat >= 0 ? categories[editingCat] : null}
          onSave={handleSaveCategory}
          onDelete={editingCat !== null && editingCat >= 0 ? () => { handleDeleteCategory(editingCat); setShowCatSheet(false); setEditingCat(null); } : null}
          onClose={() => { setShowCatSheet(false); setEditingCat(null); }}
        />
      )}
      {showProviderPicker && (
        <PickerSheet
          title="选择供应商"
          options={PROVIDERS.map(p => ({ value: p.id, label: p.name, hint: p.endpoint || '手动填写端点' }))}
          current={aiConfig.provider}
          onSelect={(id) => {
            const p = PROVIDERS.find(x => x.id === id);
            saveAiConfig({ ...aiConfig, provider: id, endpoint: p?.endpoint || aiConfig.endpoint });
            setShowProviderPicker(false);
          }}
          onClose={() => setShowProviderPicker(false)}
        />
      )}
      {showDefaultModelPicker && (
        <PickerSheet
          title="默认模型"
          options={aiModels.map(m => ({ value: m, label: m, hint: '用于未单独指定的任务' }))}
          current={aiConfig.defaultModel}
          onSelect={(val) => {
            saveAiConfig({ ...aiConfig, defaultModel: val });
            setShowDefaultModelPicker(false);
          }}
          onClose={() => setShowDefaultModelPicker(false)}
        />
      )}
      {showModelPicker && (
        <PickerSheet
          title={`模型 · ${TASK_LABELS[showModelPicker] || showModelPicker}`}
          options={[
            { value: '', label: '使用默认模型', hint: aiConfig.defaultModel || '未设置' },
            ...aiModels.map(m => ({ value: m, label: m, hint: '' })),
          ]}
          current={modelAssignment[showModelPicker] || ''}
          onSelect={(val) => {
            const updated = { ...modelAssignment, [showModelPicker]: val };
            setModelAssignment(updated);
            setMeta('modelAssignment', updated);
            setShowModelPicker(null);
          }}
          onClose={() => setShowModelPicker(null)}
        />
      )}
    </div>
  );
}

// ── Category edit/add sheet ────────────────────────────────────

const COLOR_PRESETS = [
  { name: '竹青', hex: '#5b7a5a' },
  { name: '群青', hex: '#3d5a7c' },
  { name: '藤黄', hex: '#c89342' },
  { name: '梅紫', hex: '#8b4a5e' },
  { name: '印章红', hex: '#b8443a' },
  { name: '茶色', hex: '#8b6f47' },
  { name: '墨色', hex: '#1f1a14' },
  { name: '靛蓝', hex: '#3a5f8a' },
  { name: '竹粉', hex: '#d4a0a0' },
  { name: '松绿', hex: '#4a7a5a' },
];

function CategorySheet({ category, onSave, onDelete, onClose }) {
  const T = TOKENS;
  const [name, setName] = useState(category?.name || '');
  const [colorName, setColorName] = useState(category?.color || '竹青');
  const [hex, setHex] = useState(category?.hex || '#5b7a5a');

  function handleColorPick(c) {
    setColorName(c.name);
    setHex(c.hex);
  }

  function handleSave() {
    if (!name.trim()) {
      showToast('请输入分类名称');
      return;
    }
    onSave({ name: name.trim(), color: colorName, hex });
  }

  return (
    <>
      <div className="sheet-mask" onClick={onClose} />
      <div className="sheet" style={{ height: 'auto', maxHeight: '70%' }}>
        <div className="sheet-grip" />
        <div style={{ padding: '0 24px 24px' }}>
          <div style={{
            fontSize: 12, color: 'var(--ink-mute)',
            letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 14,
            fontFamily: T.fontSerif,
          }}>{category ? '编辑分类' : '添加分类'}</div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginBottom: 4, fontFamily: T.fontSerif }}>名称</div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="分类名称"
              style={inputStyle(T)}
              autoFocus
            />
          </div>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginBottom: 8, fontFamily: T.fontSerif }}>颜色</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c.name}
                  onClick={() => handleColorPick(c)}
                  style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: c.hex,
                    border: colorName === c.name ? `2.5px solid var(--ink)` : '2px solid transparent',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'border .15s',
                  }}
                  title={c.name}
                >
                  {colorName === c.name && (
                    <span style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>✓</span>
                  )}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginTop: 6, fontFamily: T.fontSerif }}>
              {colorName} · {hex}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
            <div>
              {onDelete && (
                <button
                  className="btn-ghost"
                  onClick={onDelete}
                  style={{ color: 'var(--seal)' }}
                >删除</button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-ghost" onClick={onClose}>取消</button>
              <button className="btn-primary" onClick={handleSave}>保存</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
