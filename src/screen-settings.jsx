// screen-settings.jsx — Top-level settings page (drill-in style).

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { TOKENS } from './tokens.jsx';
import { ICONS } from './icons.jsx';
import { ScrHead, showToast } from './components.jsx';
import { Store, DEFAULT_CATEGORIES } from './store.jsx';
import { SecretsStore } from './crypto.js';
import { getMeta, setMeta } from './db.js';
import { PROVIDERS, getModelAssignment, isAIConfigured } from './ai.js';
import { Section, Row, PersonaSheet, FontSheet } from './settings-components.jsx';
import { MasterPasswordSheet, UnlockSheet } from './settings-security.jsx';

export function SettingsScreen({ settings, onChange, onResetSeed, persona, onExport, onClearAll, totalNotes, onNavigate, installPrompt, onAIConfigChange }) {
  const T = TOKENS, I = ICONS;

  const [showPersona, setShowPersona] = useState(false);
  const [showFont, setShowFont] = useState(false);

  // Summary data for top-level rows
  const [aiSummary, setAiSummary] = useState({ configured: false, provider: '', modelCount: 0 });
  const [webdavSummary, setWebdavSummary] = useState({ configured: false, lastSync: null });
  const [categoryCount, setCategoryCount] = useState(DEFAULT_CATEGORIES.length);

  // Master password (stays on top level)
  const [masterPasswordSet, setMasterPasswordSet] = useState(false);
  const [secretsUnlocked, setSecretsUnlocked] = useState(false);
  const [showMasterPwSheet, setShowMasterPwSheet] = useState(false);
  const [showUnlockSheet, setShowUnlockSheet] = useState(false);

  const secretsLocked = masterPasswordSet && !secretsUnlocked;

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
        if (hasPw) {
          setMasterPasswordSet(true);
          if (SecretsStore.isUnlocked()) setSecretsUnlocked(true);
        }
        if (savedAi) {
          setAiSummary({
            configured: isAIConfigured(savedAi, savedAssignment),
            provider: PROVIDERS.find(p => p.id === savedAi.provider)?.name || savedAi.provider || '',
            modelCount: savedAi.models?.length || 0,
          });
        }
        if (savedWebdav?.server) {
          setWebdavSummary({ configured: true, lastSync: savedLastSync || null });
        } else if (savedLastSync) {
          setWebdavSummary(prev => ({ ...prev, lastSync: savedLastSync }));
        }
        if (savedCats) setCategoryCount(savedCats.length);
      } catch {}
    })();
  }, []);

  const deletedCount = useMemo(() =>
    Store.getAllNotesWithDeleted().filter((n) => n.deleted_at).length, []
  );

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
      // Read current plaintext secrets from DB
      const [savedAi, savedWebdav] = await Promise.all([
        getMeta('aiConfig'),
        getMeta('webdavConfig'),
      ]);
      await SecretsStore.setup(password, {
        apiKey: savedAi?.apiKey || '',
        webdavPassword: savedWebdav?.password || '',
      });
      // Strip plaintext from stored configs
      if (savedAi?.apiKey) {
        const { apiKey, ...safe } = savedAi;
        await setMeta('aiConfig', safe);
      }
      if (savedWebdav?.password) {
        const { password: _, ...safe } = savedWebdav;
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
  }, [masterPasswordSet, secretsUnlocked]);

  const handleUnlock = useCallback(async (password) => {
    const ok = await SecretsStore.unlock(password);
    if (!ok) { showToast('密码错误'); return false; }
    setSecretsUnlocked(true);
    setShowUnlockSheet(false);
    // Reload AI summary with decrypted key
    const key = SecretsStore.get('apiKey');
    if (key) {
      const savedAi = await getMeta('aiConfig');
      const savedAssignment = await getModelAssignment();
      if (savedAi) {
        const hydrated = { ...savedAi, apiKey: key };
        onAIConfigChange?.(hydrated, savedAssignment);
        setAiSummary({
          configured: isAIConfigured(hydrated, savedAssignment),
          provider: PROVIDERS.find(p => p.id === hydrated.provider)?.name || hydrated.provider || '',
          modelCount: hydrated.models?.length || 0,
        });
      }
    }
    showToast('已解锁');
    return true;
  }, [onAIConfigChange]);

  const handleClearMasterPassword = useCallback(async () => {
    if (!confirm('清除主密码？加密的密钥将同时删除，需要重新输入 API Key。')) return;
    await SecretsStore.clear();
    setMasterPasswordSet(false);
    setSecretsUnlocked(false);
    showToast('主密码已清除');
  }, []);

  return (
    <div className="screen paper">
      <ScrHead title="设置" />

      <div className="scroll" style={{ flex: 1, padding: '0 20px 30px' }}>
        {/* Profile */}
        <div className="card" style={{
          borderRadius: 14, padding: 14, marginBottom: 18,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <img src="icon-192.png" alt="" aria-hidden="true" style={{
            width: 48, height: 48, borderRadius: 12,
            objectFit: 'contain', flexShrink: 0,
            transform: 'rotate(-3deg)',
            filter: 'drop-shadow(0 3px 8px rgba(40, 28, 16, .18))',
          }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: T.fontSerif, fontSize: 16, color: 'var(--ink)', fontWeight: 600 }}>本地笔记</div>
            <div style={{ fontSize: 12, color: 'var(--ink-mute)' }}>{totalNotes} 篇 · 全部存于此设备</div>
          </div>
          <div style={{
            background: 'var(--paper-deep)', padding: '4px 8px', borderRadius: 6,
            fontSize: 11, color: 'var(--ink-mute)',
          }} className="mono">本地</div>
        </div>

        {/* 基础 */}
        <Section title="基础">
          <Row icon={persona.mark} accent={persona.color} label="人格"
            value={persona.desc} onClick={() => setShowPersona(true)} />
          <Row icon={<I.pen size={14} />} label="字体"
            value={({ serif: '思源宋体', sans: '思源黑体', kai: '楷体', wenkai: '霞鹜文楷' })[settings.font] || '思源宋体'}
            onClick={() => setShowFont(true)} />
          <Row icon={<I.book size={14} />} label="卡片密度"
            value={settings.density === 'compact' ? '紧凑' : '舒适'}
            onClick={() => onChange({ ...settings, density: settings.density === 'compact' ? 'comfy' : 'compact' })} />
          <Row icon={<I.tag size={14} />} label="管理分类"
            value={`${categoryCount} 个`}
            onClick={() => onNavigate?.('settings-categories')} last />
        </Section>

        {/* 同步 · 安全 */}
        <Section title="云端">
          <Row icon={<I.sparkle size={14} />} label="AI 助手"
            value={aiSummary.configured
              ? `${aiSummary.provider}${aiSummary.modelCount > 0 ? ` · ${aiSummary.modelCount} 模型` : ''}`
              : '本地（离线）'}
            onClick={() => onNavigate?.('settings-ai')} />
          <Row icon={<I.globe size={14} />} label="WebDAV 同步"
            value={webdavSummary.lastSync
              ? `上次 ${new Date(webdavSummary.lastSync).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
              : (webdavSummary.configured ? '已配置' : '未配置')}
            onClick={() => onNavigate?.('settings-sync')} />
          <Row icon={<I.pin size={14} />}
            label={masterPasswordSet ? '主密码' : '设置主密码'}
            value={masterPasswordSet ? (secretsUnlocked ? '已解锁' : '已锁定') : '未设置'}
            onClick={() => {
              if (masterPasswordSet && !secretsUnlocked) { setShowUnlockSheet(true); return; }
              setShowMasterPwSheet(true);
            }} />
          {masterPasswordSet && (
            <Row icon={<I.trash size={14} />} label="清除主密码"
              value="删除加密" onClick={handleClearMasterPassword} last />
          )}
          {!masterPasswordSet && <div style={{ display: 'none' }} />}
        </Section>

        {/* 数据 */}
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
        <MasterPasswordSheet isChange={masterPasswordSet}
          onSubmit={handleSetMasterPassword}
          onClose={() => setShowMasterPwSheet(false)} />
      )}
      {showUnlockSheet && (
        <UnlockSheet onSubmit={handleUnlock}
          onClose={() => setShowUnlockSheet(false)} />
      )}
    </div>
  );
}
