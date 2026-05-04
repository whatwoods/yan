// screen-settings-sync.jsx — WebDAV sync sub-page.

import React, { useState, useEffect, useCallback } from 'react';
import { TOKENS } from './tokens.jsx';
import { ICONS } from './icons.jsx';
import { showToast } from './components.jsx';
import { Store, DEFAULT_CATEGORIES, addNoteToIndex, updateNoteInIndex } from './store.jsx';
import { initWebDAV, testConnection, syncAll } from './sync.js';
import { SecretsStore } from './crypto.js';
import { getMeta, setMeta } from './db.js';
import { Section, Row, SubScrHead, inputStyle } from './settings-components.jsx';
import { UnlockSheet } from './settings-security.jsx';

export function SyncSettingsScreen({ onBack, settings }) {
  const T = TOKENS, I = ICONS;

  const [webdavConfig, setWebdavConfig] = useState({ server: '', username: '', password: '', rootPath: '/yan' });
  const [webdavTesting, setWebdavTesting] = useState(false);
  const [webdavStatus, setWebdavStatus] = useState(null);
  const [showUnlockSheet, setShowUnlockSheet] = useState(false);
  const [masterPasswordSet, setMasterPasswordSet] = useState(false);
  const [secretsUnlocked, setSecretsUnlocked] = useState(false);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);

  useEffect(() => {
    (async () => {
      try {
        const [savedWebdav, savedLastSync, hasPw, savedCats] = await Promise.all([
          getMeta('webdavConfig'),
          getMeta('lastSync'),
          SecretsStore.isSetup(),
          getMeta('categories'),
        ]);
        if (hasPw) {
          setMasterPasswordSet(true);
          if (SecretsStore.isUnlocked()) setSecretsUnlocked(true);
        }
        if (savedWebdav) {
          setWebdavConfig(prev => ({ ...prev, ...savedWebdav, password: savedWebdav.password || '' }));
          if (savedWebdav.server && savedWebdav.username && !(hasPw && !SecretsStore.isUnlocked())) {
            initWebDAV(savedWebdav);
          }
        }
        if (savedLastSync) setWebdavStatus({ lastSync: savedLastSync });
        if (savedCats) setCategories(savedCats);
      } catch {}
    })();
  }, []);

  const secretsLocked = masterPasswordSet && !secretsUnlocked;

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
    if (secretsLocked) { setShowUnlockSheet(true); return; }
    setWebdavTesting(true);
    try {
      const result = await testConnection(webdavConfig);
      showToast(result.ok ? '连接成功' : '连接失败: ' + (result.error || '未知错误'));
    } catch (e) {
      showToast('连接失败: ' + e.message);
    } finally {
      setWebdavTesting(false);
    }
  }, [webdavConfig, secretsLocked]);

  const handleSync = useCallback(async () => {
    if (secretsLocked) { setShowUnlockSheet(true); return; }
    if (!webdavConfig.server) { showToast('请先配置 WebDAV'); return; }
    setWebdavStatus(prev => ({ ...prev, syncing: true }));
    try {
      initWebDAV(webdavConfig);
      const allNotes = Store.getAllCachedNotes();
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

  const handleUnlock = useCallback(async (password) => {
    const ok = await SecretsStore.unlock(password);
    if (!ok) { showToast('密码错误'); return false; }
    setSecretsUnlocked(true);
    setShowUnlockSheet(false);
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
  }, []);

  return (
    <div className="screen paper">
      <SubScrHead title="WebDAV 同步" onBack={onBack} />

      <div className="scroll" style={{ flex: 1, padding: '0 20px 30px' }}>
        <Section title="服务器配置">
          <div style={{ padding: '8px 14px', borderBottom: `1px solid var(--fold)` }}>
            <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginBottom: 4, fontFamily: T.fontSerif }}>服务器</div>
            <input type="text" value={webdavConfig.server}
              onChange={(e) => setWebdavConfig({ ...webdavConfig, server: e.target.value })}
              onBlur={() => saveWebdavConfig(webdavConfig)}
              placeholder="https://dav.example.com"
              style={inputStyle(T)} />
          </div>
          <div style={{ padding: '8px 14px', borderBottom: `1px solid var(--fold)` }}>
            <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginBottom: 4, fontFamily: T.fontSerif }}>用户名</div>
            <input type="text" value={webdavConfig.username}
              onChange={(e) => setWebdavConfig({ ...webdavConfig, username: e.target.value })}
              onBlur={() => saveWebdavConfig(webdavConfig)}
              placeholder="user"
              style={inputStyle(T)} />
          </div>
          {secretsLocked ? (
            <Row icon={<I.pin size={14} />} label="密码已加密"
              value="点击解锁" onClick={() => setShowUnlockSheet(true)} last />
          ) : (
            <div style={{ padding: '8px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginBottom: 4, fontFamily: T.fontSerif }}>密码</div>
              <input type="password" value={webdavConfig.password}
                onChange={(e) => setWebdavConfig({ ...webdavConfig, password: e.target.value })}
                onBlur={() => saveWebdavConfig(webdavConfig)}
                placeholder="******"
                style={inputStyle(T)} />
            </div>
          )}
          <div style={{ padding: '8px 14px' }}>
            <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginBottom: 4, fontFamily: T.fontSerif }}>远程路径</div>
            <input type="text" value={webdavConfig.rootPath || '/yan'}
              onChange={(e) => setWebdavConfig({ ...webdavConfig, rootPath: e.target.value || '/yan' })}
              onBlur={() => saveWebdavConfig(webdavConfig)}
              placeholder="/yan"
              style={inputStyle(T)} />
          </div>
        </Section>

        <Section title="操作">
          <Row icon={<I.bolt size={14} />}
            label={webdavTesting ? '测试中...' : '测试连接'}
            value={webdavTesting ? '...' : '测试'}
            onClick={webdavTesting ? undefined : handleWebdavTest} />
          <Row icon={<I.globe size={14} />} label="同步状态"
            value={webdavStatus?.lastSync
              ? `上次: ${new Date(webdavStatus.lastSync).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
              : '从未同步'} />
          <Row icon={<I.send size={14} />}
            label={webdavStatus?.syncing ? '同步中...' : '立即同步'}
            value={webdavStatus?.syncing ? '...' : '同步'}
            onClick={webdavStatus?.syncing ? undefined : handleSync} last />
        </Section>
      </div>

      {showUnlockSheet && (
        <UnlockSheet onSubmit={handleUnlock} onClose={() => setShowUnlockSheet(false)} />
      )}
    </div>
  );
}
