// public/js/main.js
// Cập nhật: giảm mức độ "sweep" để không xóa modal hợp lệ.
// - chỉ remove các backdrop/overlay có class/selector rõ ràng
// - đảm bảo modal được append vào body
// - gắn handler cho nút Sửa và nút Thêm phòng

(function () {
  function onReady(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }

  // remove only known problematic overlays/backdrops (safe)
  function removeCommonBackdrops() {
    try {
      const sel = ['.modal-backdrop', '.backdrop', '.overlay', '.mask-overlay', '.site-overlay', '[data-blocker="true"]'];
      sel.forEach(s => document.querySelectorAll(s).forEach(e => e.remove()));
      document.body.classList.remove('modal-open');
      // restore pointer-events if set inline to none
      document.querySelectorAll('[style]').forEach(el=>{
        try {
          if (el.style && el.style.pointerEvents === 'none') el.style.pointerEvents = '';
        } catch(e){}
      });
    } catch (e) {
      console.warn('removeCommonBackdrops error', e);
    }
  }

  // append modals to body to avoid parent overflow clipping
  function appendModalsToBody() {
    try {
      document.querySelectorAll('.modal').forEach(m => {
        if (m.parentElement !== document.body) {
          document.body.appendChild(m);
        }
        if (!m.classList.contains('show')) {
          m.style.display = 'none';
        }
      });
    } catch (e) {
      console.warn('appendModalsToBody error', e);
    }
  }

  // show/hide helpers (Bootstrap 5 aware)
  function showModalById(id) {
    const modalEl = document.getElementById(id);
    if (!modalEl) return;
    if (window.bootstrap && typeof bootstrap.Modal === 'function') {
      try {
        const inst = new bootstrap.Modal(modalEl);
        inst.show();
        return;
      } catch (e) { /* fallback */ }
    }
    // fallback manual show, but ensure we don't create blocking backdrop
    removeCommonBackdrops();
    modalEl.classList.add('show');
    modalEl.style.display = 'block';
    document.body.classList.add('modal-open');
    if (!document.querySelector('.modal-backdrop')) {
      const back = document.createElement('div');
      back.className = 'modal-backdrop fade show';
      back.style.pointerEvents = 'none';
      back.style.opacity = '0';
      document.body.appendChild(back);
    }
  }

  function hideModalByEl(modalEl) {
    if (!modalEl) return;
    if (window.bootstrap && typeof bootstrap.Modal === 'function') {
      try {
        const inst = bootstrap.Modal.getInstance(modalEl);
        if (inst) { inst.hide(); return; }
      } catch (e) { /* fallback */ }
    }
    modalEl.classList.remove('show');
    modalEl.style.display = 'none';
    document.body.classList.remove('modal-open');
    const back = document.querySelector('.modal-backdrop');
    if (back) back.remove();
  }

  // attach edit handlers
  function initEditRoomButtons() {
    try {
      document.querySelectorAll('.btn-edit-room').forEach(btn => {
        // remove old bound handler if any
        if (btn._editHandler) btn.removeEventListener('click', btn._editHandler);
        const handler = function (e) {
          e.preventDefault();
          const ds = btn.dataset || {};
          const id = ds.id || '';
          const number = ds.number || ds.roomNumber || '';
          const type = ds.type || '';
          const price = ds.price || '';
          const status = ds.status || 'available';
          const location = ds.location || '';
          const image = ds.image || '';

          const map = {
            editRoomId: id,
            editRoomNumber: number,
            editRoomType: type,
            editRoomPrice: price,
            editRoomStatus: status,
            editRoomLocation: location,
            editRoomImage: image
          };
          Object.keys(map).forEach(k => {
            const el = document.getElementById(k);
            if (el) el.value = map[k];
          });

          showModalById('editRoomModal');
        };
        btn.addEventListener('click', handler);
        btn._editHandler = handler;
      });
    } catch (e) {
      console.warn('initEditRoomButtons error', e);
    }
  }

  // init "Add room" button to open add-modal (avoids redirect to missing route)
  function initAddRoomButton() {
    const addBtn = document.getElementById('btnAddRoom');
    if (!addBtn) return;
    addBtn.addEventListener('click', function(e){
      e.preventDefault();
      // clear fields in add modal
      const arr = ['addRoomNumber','addRoomType','addRoomPrice','addRoomStatus','addRoomLocation','addRoomImage'];
      arr.forEach(id=>{
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      showModalById('addRoomModal');
    });
  }

  // dropdown fallback (if bootstrap dropdown not loaded)
  function initDropdownFallback() {
    document.addEventListener('click', function (e) {
      const toggle = e.target.closest('.dropdown-toggle');
      if (!toggle) return;
      e.preventDefault();
      const parent = toggle.parentElement;
      if (!parent) return;
      const menu = parent.querySelector('.dropdown-menu');
      if (!menu) return;
      document.querySelectorAll('.dropdown-menu.show').forEach(m => { if (m !== menu) m.classList.remove('show'); });
      menu.classList.toggle('show');
    }, true);
  }

  onReady(function () {
    appendModalsToBody();
    removeCommonBackdrops();
    initEditRoomButtons();
    initAddRoomButton();
    initDropdownFallback();

    // close manual modals on click to [data-bs-dismiss] or .btn-close
    document.addEventListener('click', function (e) {
      const dismiss = e.target.closest('[data-bs-dismiss="modal"], .btn-close');
      if (dismiss) {
        const modalEl = e.target.closest('.modal');
        if (modalEl) hideModalByEl(modalEl);
      }
    });

    // escape key close fallback
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal.show').forEach(m => hideModalByEl(m));
      }
    });

    // small delayed cleanup only for obvious backdrops (not sweeps)
    setTimeout(removeCommonBackdrops, 300);
  });

})();
