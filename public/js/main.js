// public/js/main.js
(function (global) {
  'use strict';

  function onReady(fn){ if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }

  function removeKnownExtensionOverlays(){
    try {
      ['#__en2vi-host','#envi2-host','#en2vi-host','.savior-host','.corom-element','.overlay','[data-savior-injected]']
        .forEach(sel => document.querySelectorAll(sel).forEach(el => { try{ el.remove(); } catch(e){ el.style.display='none'; el.style.pointerEvents='none'; } }));
    } catch(e){}
  }

  function showModalById(id){
    const modal = document.getElementById(id);
    if (!modal) return;
    if (window.bootstrap && window.bootstrap.Modal){
      try { new bootstrap.Modal(modal).show(); return; } catch(e){}
    }
    modal.classList.add('show');
    modal.style.display = 'block';
    modal.setAttribute('aria-hidden','false');
    document.body.classList.add('modal-open');
    if (!document.querySelector('.modal-backdrop')){
      const b = document.createElement('div');
      b.className = 'modal-backdrop';
      b.style.position = 'fixed';
      b.style.left = '0'; b.style.top = '0';
      b.style.width = '100%'; b.style.height = '100%';
      b.style.zIndex = '1040'; b.style.background = 'rgba(0,0,0,0.25)';
      document.body.appendChild(b);
    }
  }

  function hideModalById(id){
    const modal = document.getElementById(id);
    if (!modal) return;
    if (window.bootstrap && window.bootstrap.Modal){
      try {
        const inst = bootstrap.Modal.getInstance(modal);
        if (inst) inst.hide(); else new bootstrap.Modal(modal).hide();
        return;
      } catch(e){}
    }
    modal.classList.remove('show');
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden','true');
    document.body.classList.remove('modal-open');
    document.querySelectorAll('.modal-backdrop').forEach(b => { try{ b.remove(); } catch(e){} });
  }

  function initEditRoomButtons(){
    document.querySelectorAll('.btn-edit-room, .btn-edit, .edit-room-btn').forEach(btn=>{
      if (btn._attachedEditHandler) return;
      const handler = function(e){
        e.preventDefault();
        removeKnownExtensionOverlays();
        const ds = btn.dataset || {};
        const id = ds.id || ds.roomid || ds.roomId || ds.roomId || ds['room-id'] || ds['room-id'];
        const form = document.getElementById('editRoomForm');
        if (form && id){
          // set action if needed
          try { form.action = '/admin/rooms/' + id + '?_method=PUT'; } catch(e){}
          const setVal = (sel, v) => { const el=document.querySelector(sel); if(!el) return; if('value' in el) el.value = v; else el.textContent = v; };
          setVal('#editRoomId', id);
          setVal('#editRoomNumber', ds.roomNumber || ds.number || '');
          setVal('#editRoomType', ds.type || '');
          setVal('#editRoomPrice', ds.price || '');
          setVal('#editRoomStatus', ds.status || '');
          setVal('#editRoomLocation', ds.location || '');
          const preview = document.getElementById('editRoomPreview');
          if (preview){
            if (ds.image){ preview.src = ds.image; preview.style.display='block'; } else { preview.src=''; preview.style.display='none'; }
          }
        }
        showModalById('editRoomModal');
      };
      btn.addEventListener('click', handler);
      btn._attachedEditHandler = true;
    });
  }

  function initAddRoomButton(){
    const addBtn = document.getElementById('addRoomBtn') || document.getElementById('btnAddRoom') || document.querySelector('.add-room-btn') || document.querySelector('[data-action="add-room"]');
    if (!addBtn) return;
    if (addBtn._attachedAddHandler) return;
    const handler = function(e){
      e.preventDefault();
      removeKnownExtensionOverlays();
      const form = document.getElementById('addRoomForm');
      if (form) form.reset();
      const prev = document.getElementById('addRoomPreview') || document.getElementById('addRoomImagePreview');
      if (prev){ try{ prev.src=''; prev.style.display='none'; } catch(e){} }
      showModalById('addRoomModal');
    };
    addBtn.addEventListener('click', handler);
    addBtn._attachedAddHandler = true;
  }

  function initPreviewInputs(){
    document.querySelectorAll('input[type="file"]').forEach(inp=>{
      if (inp._previewAttached) return;
      const h = function(){
        try {
          const file = inp.files && inp.files[0]; if(!file) return;
          const id = inp.dataset.preview || inp.getAttribute('data-preview') || (inp.id === 'addRoomImage' ? 'addRoomPreview' : (inp.id === 'editRoomImage' ? 'editRoomPreview' : ''));
          const prev = id ? document.getElementById(id) : null;
          const r = new FileReader();
          r.onload = function(ev){
            if (!prev) return;
            if (prev.tagName === 'IMG'){ prev.src = ev.target.result; prev.style.display = 'block'; }
            else prev.innerHTML = '<img src="' + ev.target.result + '" style="max-width:120px;max-height:80px;border-radius:6px;">';
          };
          r.readAsDataURL(file);
        } catch(e){}
      };
      inp.addEventListener('change', h);
      inp._previewAttached = true;
    });
  }

  function initAll(){
    removeKnownExtensionOverlays();
    initEditRoomButtons();
    initAddRoomButton();
    initPreviewInputs();
    // ensure dropdown fallback works if bootstrap missing
    try {
      if (!window.bootstrap) {
        document.querySelectorAll('.dropdown-toggle').forEach(t => {
          if (t._fallbackBound) return;
          t.addEventListener('click', function(e){
            e.preventDefault();
            const menu = t.parentElement.querySelector('.dropdown-menu');
            if (!menu) return;
            const open = menu.classList.contains('show');
            document.querySelectorAll('.dropdown-menu.show').forEach(m=>m.classList.remove('show'));
            if (!open) menu.classList.add('show');
          });
          t._fallbackBound = true;
        });
      }
    } catch(e){}
  }

  global.initEditRoomButtons = initEditRoomButtons;
  global.initAddRoomButton = initAddRoomButton;
  global.initPreviewInputs = initPreviewInputs;
  global.mainSafeInit = initAll;

  onReady(function(){ try{ initAll(); } catch(e){ console.warn('mainSafeInit', e); } setTimeout(()=>{ try{ initAll(); } catch(e){} }, 400); });

})(window);
