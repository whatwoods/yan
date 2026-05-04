// screen-settings-ai.jsx — AI settings sub-page (provider, model assignment, auto-tag).

import React, { useState, useEffect, useCallback } from 'react';
import { TOKENS } from './tokens.jsx';
import { ICONS } from './icons.jsx';
import { showToast } from './components.jsx';
import { getMeta, setMeta } from './db.js';
import { SecretsStore } from './crypto.js';
import { PROVIDERS, TASK_LABELS, fetchModels as aiFetchModels, getModelAssignment, isAIConfigured } from './ai.js';
import { Section, Row, PickerSheet, SubScrHead, inputStyle } from './settings-components.jsx';
import { UnlockSheet } from './settings-security.jsx';

export function AISettingsScreen({ onBack, persona, settings, onSettingsChange, onAIConfigChange }) {
  const T = TOKENS, I = ICONS;

  const [aiConfig, setAiConfig] = useState({ provider: 'deepseek', endpoint: '', apiKey: '', models: [], defaultModel: '' });
  const [aiTesting, setAiTesting] = useState(false);
  const [aiModels, setAiModels] = useState([]);
  const [modelAssignment, setModelAssignment] = useState({ classify: '', tag: '', summarize: '', insight: '', ask: '', curator: '' });
  const [showProviderPicker, setShowProviderPicker] = useState(false);
  const [showDefaultModelPicker, setShowDefaultModelPicker] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(null);
  const [showUnlockSheet, setShowUnlockSheet] = useState(false);
  const [masterPasswordSet, setMasterPasswordSet] = useState(false);
  const [secretsUnlocked, setSecretsUnlocked] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [savedAi, savedAssignment, hasPw] = await Promise.all([
          getMeta('aiConfig'),
          getModelAssignment(),
          SecretsStore.isSetup(),
        ]);
        if (hasPw) {
          setMasterPasswordSet(true);
          if (SecretsStore.isUnlocked()) setSecretsUnlocked(true);
        }
        if (savedAi) {
          const hydrated = { ...savedAi, apiKey: savedAi.apiKey || SecretsStore.get('apiKey') || '' };
          setAiConfig(prev => ({ ...prev, ...hydrated }));
          setAiModels(hydrated.models || []);
          onAIConfigChange?.(hydrated, savedAssignment);
        }
        if (savedAssignment) setModelAssignment(savedAssignment);
      } catch {}
    })();
  }, []);

  const secretsLocked = masterPasswordSet && !secretsUnlocked;

  const saveAiConfig = useCallback(async (config) => {
    setAiConfig(config);
    const models = config.models || [];
    setAiModels(models);
    if (masterPasswordSet && secretsUnlocked) {
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

  const handleUnlock = useCallback(async (password) => {
    const ok = await SecretsStore.unlock(password);
    if (!ok) { showToast('密码错误'); return false; }
    setSecretsUnlocked(true);
    setShowUnlockSheet(false);
    const key = SecretsStore.get('apiKey');
    if (key) {
      setAiConfig(prev => {
        const next = { ...prev, apiKey: key };
        onAIConfigChange?.(next, modelAssignment);
        return next;
      });
    }
    showToast('已解锁');
    return true;
  }, [modelAssignment, onAIConfigChange]);

  return (
    <div className="screen paper">
      <SubScrHead title="AI 助手" onBack={onBack} />

      <div className="scroll" style={{ flex: 1, padding: '0 20px 30px' }}>
        {secretsLocked ? (
          <Section title="密钥已加密">
            <Row icon={<I.pin size={14} />} label="点击解锁"
              value="解锁后可配置 AI" onClick={() => setShowUnlockSheet(true)} last />
          </Section>
        ) : (
          <>
            <Section title="供应商">
              <Row icon={<I.globe size={14} />} label="供应商"
                value={PROVIDERS.find(p => p.id === aiConfig.provider)?.name || '未设置'}
                onClick={() => setShowProviderPicker(true)} />
              <div style={{ padding: '8px 14px', borderBottom: `1px solid var(--fold)` }}>
                <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginBottom: 4, fontFamily: T.fontSerif }}>端点</div>
                <input type="text" value={aiConfig.endpoint}
                  onChange={(e) => setAiConfig({ ...aiConfig, endpoint: e.target.value })}
                  onBlur={() => saveAiConfig(aiConfig)}
                  placeholder={PROVIDERS.find(p => p.id === aiConfig.provider)?.endpoint || 'https://...'}
                  style={inputStyle(T)} />
              </div>
              <div style={{ padding: '8px 14px', borderBottom: `1px solid var(--fold)` }}>
                <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginBottom: 4, fontFamily: T.fontSerif }}>API Key</div>
                <input type="password" value={aiConfig.apiKey}
                  onChange={(e) => setAiConfig({ ...aiConfig, apiKey: e.target.value })}
                  onBlur={() => saveAiConfig(aiConfig)}
                  placeholder="sk-..."
                  style={inputStyle(T)} />
              </div>
              <Row icon={<I.bolt size={14} />}
                label={aiTesting ? '测试中...' : '测试连接'}
                value={aiTesting ? '...' : '测试'}
                onClick={aiTesting ? undefined : handleAiTest} />
              {aiModels.length > 0 && (
                <Row icon={<I.bolt size={14} />} label="默认模型"
                  value={aiConfig.defaultModel || '未设置'}
                  onClick={() => setShowDefaultModelPicker(true)} last />
              )}
            </Section>

            <Section title="行为">
              <Row icon={<I.sparkle size={14} />} label="自动识别打标签"
                value={settings.autoTag ? '开' : '关'}
                onClick={() => onSettingsChange({ ...settings, autoTag: !settings.autoTag })} last />
            </Section>

            {aiModels.length > 0 && (
              <Section title="任务模型分配">
                {Object.entries(TASK_LABELS).map(([key, label], idx, arr) => (
                  <Row key={key}
                    icon={<span style={{ fontSize: 11, color: 'var(--ink-mute)' }}>{label[0]}</span>}
                    label={label}
                    value={modelAssignment[key] || aiConfig.defaultModel || '默认'}
                    onClick={() => setShowModelPicker(key)}
                    last={idx === arr.length - 1} />
                ))}
              </Section>
            )}
          </>
        )}

        <div style={{ textAlign: 'center', padding: '20px 0 10px',
          fontFamily: T.fontMono, fontSize: 11, color: 'var(--ink-fade)' }}>
          {isAIConfigured(aiConfig, modelAssignment)
            ? `已配置 · ${PROVIDERS.find(p => p.id === aiConfig.provider)?.name || aiConfig.provider}`
            : '本地（离线）'}
        </div>
      </div>

      {/* Sheets */}
      {showUnlockSheet && (
        <UnlockSheet onSubmit={handleUnlock} onClose={() => setShowUnlockSheet(false)} />
      )}
      {showProviderPicker && (
        <PickerSheet title="选择供应商"
          options={PROVIDERS.map(p => ({ value: p.id, label: p.name, hint: p.endpoint || '手动填写端点' }))}
          current={aiConfig.provider}
          onSelect={(id) => {
            const p = PROVIDERS.find(x => x.id === id);
            saveAiConfig({ ...aiConfig, provider: id, endpoint: p?.endpoint || aiConfig.endpoint });
            setShowProviderPicker(false);
          }}
          onClose={() => setShowProviderPicker(false)} />
      )}
      {showDefaultModelPicker && (
        <PickerSheet title="默认模型"
          options={aiModels.map(m => ({ value: m, label: m, hint: '用于未单独指定的任务' }))}
          current={aiConfig.defaultModel}
          onSelect={(val) => { saveAiConfig({ ...aiConfig, defaultModel: val }); setShowDefaultModelPicker(false); }}
          onClose={() => setShowDefaultModelPicker(false)} />
      )}
      {showModelPicker && (
        <PickerSheet title={`模型 · ${TASK_LABELS[showModelPicker] || showModelPicker}`}
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
          onClose={() => setShowModelPicker(null)} />
      )}
    </div>
  );
}
