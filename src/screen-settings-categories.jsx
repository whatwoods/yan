// screen-settings-categories.jsx — Categories management sub-page.

import React, { useState, useEffect, useCallback } from 'react';
import { TOKENS } from './tokens.jsx';
import { ICONS } from './icons.jsx';
import { showToast } from './components.jsx';
import { Store, DEFAULT_CATEGORIES } from './store.jsx';
import { getMeta, setMeta } from './db.js';
import { Section, Row, SubScrHead, inputStyle } from './settings-components.jsx';

export function CategoriesSettingsScreen({ onBack }) {
  const T = TOKENS, I = ICONS;

  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [showCatSheet, setShowCatSheet] = useState(false);
  const [editingCat, setEditingCat] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const savedCats = await getMeta('categories');
        if (savedCats) setCategories(savedCats);
      } catch {}
    })();
  }, []);

  const saveCategories = useCallback(async (cats) => {
    setCategories(cats);
    await setMeta('categories', cats);
    await Store.saveCategories(cats);
  }, []);

  const handleSaveCategory = useCallback((catData) => {
    let updated;
    if (editingCat !== null && editingCat >= 0) {
      updated = categories.map((c, i) => i === editingCat ? catData : c);
    } else {
      updated = [...categories, catData];
    }
    saveCategories(updated);
    setShowCatSheet(false);
    setEditingCat(null);
  }, [categories, editingCat, saveCategories]);

  const handleDeleteCategory = useCallback(async (index) => {
    const catName = categories[index].name;
    const fallbackName = '想法';
    const migrateTo = catName === fallbackName
      ? (DEFAULT_CATEGORIES.find(c => c.name !== catName)?.name ?? categories.find((c, i) => i !== index)?.name)
      : fallbackName;
    if (!confirm(`删除分类「${catName}」？\n该分类下的笔记将移到「${migrateTo}」。`)) return;

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
      <SubScrHead title="管理分类" onBack={onBack} />

      <div className="scroll" style={{ flex: 1, padding: '0 20px 30px' }}>
        <Section title="分类列表">
          {categories.map((cat, idx) => (
            <Row key={cat.name}
              icon={<span style={{ width: 10, height: 10, borderRadius: '50%', background: cat.hex, display: 'inline-block' }} />}
              label={cat.name}
              value={cat.color}
              onClick={() => { setEditingCat(idx); setShowCatSheet(true); }}
              last={idx === categories.length - 1} />
          ))}
          <Row icon={<I.plus size={14} />} label="添加分类"
            value="+"
            onClick={() => { setEditingCat(null); setShowCatSheet(true); }} last />
        </Section>
      </div>

      {showCatSheet && (
        <CategorySheet
          category={editingCat !== null && editingCat >= 0 ? categories[editingCat] : null}
          onSave={handleSaveCategory}
          onDelete={editingCat !== null && editingCat >= 0
            ? () => { handleDeleteCategory(editingCat); setShowCatSheet(false); setEditingCat(null); }
            : null}
          onClose={() => { setShowCatSheet(false); setEditingCat(null); }} />
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
            <input type="text" value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="分类名称"
              style={inputStyle(T)} autoFocus />
          </div>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginBottom: 8, fontFamily: T.fontSerif }}>颜色</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {COLOR_PRESETS.map((c) => (
                <button key={c.name} onClick={() => handleColorPick(c)} style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: c.hex,
                  border: colorName === c.name ? `2.5px solid var(--ink)` : '2px solid transparent',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'border .15s',
                }} title={c.name}>
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
                <button className="btn-ghost" onClick={onDelete} style={{ color: 'var(--seal)' }}>删除</button>
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
