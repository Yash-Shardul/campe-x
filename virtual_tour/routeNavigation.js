/**
 * ============================================================
 * CampeX – Guided Campus Route Navigation Controller
 * routeNavigation.js  (v3 – fully debugged)
 * ============================================================
 *
 * BUG HISTORY:
 *  v1 – MutationObserver on #pano fired 1000s of times/sec → FREEZE
 *  v2 – stopRouteCardPropagation() used capture:true which blocked
 *       ALL click events from reaching child elements (button/selects)
 *       → Start Tour button silently never fired
 *  v3 – Both fixed. Clean, minimal, mirrors the existing sidebar
 *       scene-switch pattern exactly.
 *
 * HOW SCENE SWITCHING WORKS (mirrors sidebar at index.js:192-209):
 *   sidebar:  findSceneById(id) → switchScene(scene)
 *   us:       window.campexSwitchScene(sceneId) which wraps same calls
 *
 * DEPENDENCIES (loaded before this file):
 *   routeData.js → CAMPUS_LOCATIONS, CAMPUS_GRAPH, findRoute(),
 *                  getLocationById(), getDisplayNameForScene()
 *   index.js     → window.campexSwitchScene(sceneId)
 *                  window.campexGetCurrentSceneId()
 *                  window.campexOnSceneChange called on every switchScene
 * ============================================================
 */

'use strict';

(function () {

  /* ──────────────────────────────────────────────────────────
   *  STATE
   * ────────────────────────────────────────────────────────── */
  var state = {
    active:          false,
    route:           [],   // ordered array of sceneId strings
    currentStep:     0,
    destSceneId:     null,
    highlightTimer:  null
  };

  /* ──────────────────────────────────────────────────────────
   *  EXPOSE the scene-change hook IMMEDIATELY so index.js can
   *  call it as soon as switchScene() fires (it is referenced
   *  by name before routeNavigation.js finishes loading).
   * ────────────────────────────────────────────────────────── */
  window.campexOnSceneChange = function (newSceneId) {
    if (!state.active) return;
    handleSceneChange(newSceneId);
  };

  /* ──────────────────────────────────────────────────────────
   *  POPULATE DROPDOWNS from CAMPUS_LOCATIONS
   * ────────────────────────────────────────────────────────── */
  function populateDropdowns() {
    var startSel = document.getElementById('startSelect');
    var destSel  = document.getElementById('destSelect');
    if (!startSel || !destSel) {
      console.error('[RouteNav] Dropdown elements not found in DOM');
      return;
    }

    var locs = window.CAMPUS_LOCATIONS || [];
    if (locs.length === 0) {
      console.error('[RouteNav] CAMPUS_LOCATIONS is empty – check routeData.js loaded');
      return;
    }

    locs.forEach(function (loc) {
      var o1 = document.createElement('option');
      o1.value       = loc.id;
      o1.textContent = loc.name;
      startSel.appendChild(o1);

      var o2 = document.createElement('option');
      o2.value       = loc.id;
      o2.textContent = loc.name;
      destSel.appendChild(o2);
    });

    console.log('[RouteNav] Dropdowns populated with', locs.length, 'locations');
  }

  /* ──────────────────────────────────────────────────────────
   *  CARD COLLAPSE TOGGLE
   *  NOTE: stopPropagation is called in bubble phase ONLY on the
   *  specific button — NOT a blanket capture-phase blocker.
   * ────────────────────────────────────────────────────────── */
  function initCardToggle() {
    var btn  = document.getElementById('routeCardToggle');
    var body = document.getElementById('routeCardBody');
    if (!btn || !body) return;

    // Sync icon to reflect the default-collapsed state set in HTML
    _syncToggleIcon(btn, body);

    btn.addEventListener('click', function (e) {
      e.stopPropagation(); // bubble-phase only – child events unaffected
      body.classList.toggle('rn-body--collapsed');
      var isCollapsed = body.classList.contains('rn-body--collapsed');
      btn.title = isCollapsed ? 'Expand Campus Route' : 'Collapse Campus Route';
      btn.setAttribute('aria-label', isCollapsed ? 'Expand Campus Route' : 'Collapse Campus Route');
      _syncToggleIcon(btn, body);
    });
  }

  /* Swap the Tabler chevron icon class based on collapsed state */
  function _syncToggleIcon(btn, body) {
    var icon = btn.querySelector('.rn-toggle-icon');
    if (!icon) return;
    var isCollapsed = body.classList.contains('rn-body--collapsed');
    icon.classList.remove('ti-chevron-right', 'ti-chevron-down');
    icon.classList.add(isCollapsed ? 'ti-chevron-right' : 'ti-chevron-down');
  }

  /* ──────────────────────────────────────────────────────────
   *  ERROR / STATUS DISPLAY
   * ────────────────────────────────────────────────────────── */
  function showError (msg) {
    _showStatus(msg, 'error');
  }
  function showStatus (msg) {
    _showStatus(msg, 'info');
  }
  function _showStatus (msg, type) {
    var el = document.getElementById('routeError');
    if (!el) return;
    el.textContent  = (type === 'error' ? '⚠ ' : 'ℹ ') + msg;
    el.style.display = 'block';
    el.style.color   = type === 'error' ? '#ff6b6b' : '#00e676';
    clearTimeout(el._timer);
    el._timer = setTimeout(function () { el.style.display = 'none'; }, 3500);
  }

  /* ──────────────────────────────────────────────────────────
   *  START TOUR  — main entry point
   *  Called by the "Start Tour" button click.
   *  Mirrors the sidebar pattern: get sceneId → call campexSwitchScene
   * ────────────────────────────────────────────────────────── */
  function onStartTourClick(e) {
    // Bubble-phase stopPropagation so event doesn't reach pano viewer
    if (e) e.stopPropagation();

    var startSel = document.getElementById('startSelect');
    var destSel  = document.getElementById('destSelect');
    var startId  = startSel ? startSel.value : '';
    var destId   = destSel  ? destSel.value  : '';

    console.log('[RouteNav] Start Tour clicked — from:', startId, '→ to:', destId);

    // ── Validate ────────────────────────────────────────────
    if (!startId)            { showError('Please select a Starting Point.'); return; }
    if (!destId)             { showError('Please select a Destination.');    return; }
    if (startId === destId)  { showError('Start and Destination must differ.'); return; }

    var startLoc = window.getLocationById(startId);
    var destLoc  = window.getLocationById(destId);

    if (!startLoc) { showError('Unknown start location: ' + startId); return; }
    if (!destLoc)  { showError('Unknown destination: '    + destId);  return; }

    console.log('[RouteNav] Start scene:', startLoc.sceneId, '| Dest scene:', destLoc.sceneId);

    // ── BFS route ───────────────────────────────────────────
    var route = window.findRoute(window.CAMPUS_GRAPH, startLoc.sceneId, destLoc.sceneId);

    if (!route || route.length === 0) {
      showError('No route found. Try a different start or destination.');
      console.warn('[RouteNav] BFS returned null for', startLoc.sceneId, '→', destLoc.sceneId);
      return;
    }

    console.log('[RouteNav] Route found (' + route.length + ' steps):', route.join(' → '));

    // ── Set state BEFORE switching scene ────────────────────
    // (campexOnSceneChange fires synchronously inside switchScene,
    //  so state must already be correct when it fires)
    state.active      = true;
    state.route       = route;
    state.currentStep = 0;
    state.destSceneId = destLoc.sceneId;

    // ── Switch to starting scene ─────────────────────────────
    // Uses the SAME mechanism as the existing sidebar scene cards:
    //   sidebar:  el.click() → findSceneById(id) → switchScene(scene)
    //   us:       campexSwitchScene(sceneId) → findSceneById → switchScene
    navigateToScene(route[0]);

    // ── Update UI ────────────────────────────────────────────
    showProgressPanel();
    renderProgressPanel();

    // Hotspot highlighting is deferred 500ms so Marzipano renders
    // the new scene's hotspot DOM elements before we query them
    scheduleHighlight(500);

    // Collapse the selector card
    collapseCard();
  }

  /* ──────────────────────────────────────────────────────────
   *  NAVIGATE TO A SCENE  — wraps campexSwitchScene
   *  Falls back to the same click mechanism as the sidebar.
   * ────────────────────────────────────────────────────────── */
  function navigateToScene(sceneId) {
    if (!sceneId) {
      console.error('[RouteNav] navigateToScene called with empty sceneId');
      return;
    }

    if (window.campexSwitchScene) {
      console.log('[RouteNav] Navigating to scene:', sceneId);
      window.campexSwitchScene(sceneId);
      return;
    }

    // Fallback: click the scene-card link in the sidebar (same as sidebar logic)
    var cards = document.querySelectorAll('#sceneList .scene-card');
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].getAttribute('data-id') === sceneId) {
        console.log('[RouteNav] Fallback: clicking scene card for', sceneId);
        cards[i].click();
        return;
      }
    }

    console.error('[RouteNav] Scene not found anywhere:', sceneId);
    showError('Could not navigate to scene: ' + sceneId);
  }

  /* ──────────────────────────────────────────────────────────
   *  HANDLE SCENE CHANGE  — called by window.campexOnSceneChange
   *  Which is invoked by index.js > switchScene() at line ~272
   * ────────────────────────────────────────────────────────── */
  function handleSceneChange(newSceneId) {
    if (!state.active) return;

    var route = state.route;
    var step  = state.currentStep;

    console.log('[RouteNav] Scene changed to:', newSceneId,
                '| Route step:', step + '/' + (route.length - 1));

    // ── Advance step if correct next scene was entered ─────
    if (step + 1 < route.length && route[step + 1] === newSceneId) {
      state.currentStep = step + 1;
      console.log('[RouteNav] Advanced to step', state.currentStep);

    } else if (route[step] !== newSceneId) {
      // User wandered off-route — find their new position
      var idx = route.indexOf(newSceneId);
      if (idx !== -1) {
        state.currentStep = idx;
        console.log('[RouteNav] Off-route, snapped to step', idx);
      } else {
        console.log('[RouteNav] Completely off-route (scene not in route)');
      }
    }

    // ── Arrival check ──────────────────────────────────────
    if (newSceneId === state.destSceneId || state.currentStep >= route.length - 1) {
      onArrival();
      return;
    }

    // ── Update UI ──────────────────────────────────────────
    renderProgressPanel();
    scheduleHighlight(500); // wait for new hotspot DOM elements
  }

  /* ──────────────────────────────────────────────────────────
   *  ARRIVAL
   * ────────────────────────────────────────────────────────── */
  function onArrival() {
    state.currentStep = state.route.length - 1;
    renderProgressPanel();
    clearHighlighting();

    var arrivedEl = document.getElementById('rpArrived');
    if (arrivedEl) arrivedEl.style.display = 'block';

    console.log('[RouteNav] 🎉 Arrived at destination!');

    // Auto-exit guided mode after 5s
    setTimeout(function () {
      if (!state.active) return;
      clearRoute();
    }, 5000);
  }

  /* ──────────────────────────────────────────────────────────
   *  CLEAR ROUTE
   * ────────────────────────────────────────────────────────── */
  function clearRoute() {
    if (state.highlightTimer) {
      clearTimeout(state.highlightTimer);
      state.highlightTimer = null;
    }

    state.active      = false;
    state.route       = [];
    state.currentStep = 0;
    state.destSceneId = null;

    hideProgressPanel();
    clearHighlighting();
    expandCard();

    var arrivedEl = document.getElementById('rpArrived');
    if (arrivedEl) arrivedEl.style.display = 'none';

    // ── Reset dropdowns so inputs are blank for the next tour ──
    var startSel = document.getElementById('startSelect');
    var destSel  = document.getElementById('destSelect');
    if (startSel) startSel.value = '';
    if (destSel)  destSel.value  = '';

    console.log('[RouteNav] Route cleared');
  }

  /* ──────────────────────────────────────────────────────────
   *  CARD HELPERS
   * ────────────────────────────────────────────────────────── */
  function collapseCard() {
    var body = document.getElementById('routeCardBody');
    var btn  = document.getElementById('routeCardToggle');
    if (body) body.classList.add('rn-body--collapsed');
    if (btn) {
      btn.title = 'Expand Campus Route';
      btn.setAttribute('aria-label', 'Expand Campus Route');
      var icon = btn.querySelector('.rn-toggle-icon');
      if (icon) { icon.classList.remove('ti-chevron-down'); icon.classList.add('ti-chevron-right'); }
    }
  }

  function expandCard() {
    var body = document.getElementById('routeCardBody');
    var btn  = document.getElementById('routeCardToggle');
    if (body) body.classList.remove('rn-body--collapsed');
    if (btn) {
      btn.title = 'Collapse Campus Route';
      btn.setAttribute('aria-label', 'Collapse Campus Route');
      var icon = btn.querySelector('.rn-toggle-icon');
      if (icon) { icon.classList.remove('ti-chevron-right'); icon.classList.add('ti-chevron-down'); }
    }
  }

  /* ──────────────────────────────────────────────────────────
   *  PROGRESS PANEL
   * ────────────────────────────────────────────────────────── */
  function showProgressPanel() {
    var panel = document.getElementById('routeProgressPanel');
    if (!panel) return;
    panel.style.display = 'block';
  }

  function hideProgressPanel() {
    var panel = document.getElementById('routeProgressPanel');
    if (panel) panel.style.display = 'none';
  }

  function renderProgressPanel() {
    var route = state.route;
    var step  = state.currentStep;
    if (!route || route.length === 0) return;

    var getName = window.getDisplayNameForScene || function (id) { return id; };

    // ── Route chip strip — vertical list (one stop per row) ─────
    var pathEl = document.getElementById('rpPath');
    if (pathEl) {
      var html = '';
      route.forEach(function (sceneId, idx) {
        var cls = 'rp-chip';
        if (idx === step)       cls += ' rp-chip--current';
        else if (idx < step)    cls += ' rp-chip--done';
        var label = (getName(sceneId) || sceneId)
                      .replace(/&/g,'&amp;').replace(/</g,'&lt;');
        // data-step used by CSS ::before to show step number badge
        html += '<span class="' + cls + '" data-step="' + (idx + 1) + '">' + label + '</span>';
        if (idx < route.length - 1) {
          html += '<span class="rp-arrow">↓</span>';
        }
      });
      pathEl.innerHTML = html;

      // Auto-scroll so the current chip is always visible
      var currentChip = pathEl.querySelector('.rp-chip--current');
      if (currentChip) {
        setTimeout(function() {
          currentChip.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }, 50);
      }
    }

    // ── Info grid ──────────────────────────────────────────
    _setText('rpCurrent', getName(route[step]));
    _setText('rpNext',  step + 1 < route.length ? getName(route[step + 1]) : '—');
    _setText('rpDest',  getName(route[route.length - 1]));

    // ── Progress bar ───────────────────────────────────────
    var pct = route.length > 1
      ? Math.round((step / (route.length - 1)) * 100)
      : 100;
    var barEl = document.getElementById('rpBar');
    if (barEl) barEl.style.width = pct + '%';
    _setText('rpStepLabel', 'Step ' + (step + 1) + ' of ' + route.length);
  }

  function _setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text || '';
  }

  /* ──────────────────────────────────────────────────────────
   *  HOTSPOT HIGHLIGHTING
   *  Called via scheduleHighlight() — always after a setTimeout
   *  so Marzipano has time to render the new scene's hotspots.
   *  data-route-target is stamped by index.js createLinkHotspotElement.
   * ────────────────────────────────────────────────────────── */
  function scheduleHighlight(delayMs) {
    if (state.highlightTimer) clearTimeout(state.highlightTimer);
    state.highlightTimer = setTimeout(function () {
      state.highlightTimer = null;
      if (state.active) applyHighlighting();
    }, delayMs || 500);
  }

  function applyHighlighting() {
    if (!state.active) return;

    var route       = state.route;
    var step        = state.currentStep;
    var nextSceneId = (step + 1 < route.length) ? route[step + 1] : null;
    var getName     = window.getDisplayNameForScene || function (id) { return id; };

    var hotspots = document.querySelectorAll('.link-hotspot');

    if (hotspots.length === 0) {
      // Marzipano hasn't rendered them yet — retry once
      console.log('[RouteNav] No hotspots in DOM yet, retrying in 400ms');
      state.highlightTimer = setTimeout(applyHighlighting, 400);
      return;
    }

    console.log('[RouteNav] Highlighting', hotspots.length,
                'hotspots. Next target:', nextSceneId);

    hotspots.forEach(function (el) {
      var target = el.getAttribute('data-route-target') || '';

      // Clear previous route styles
      el.classList.remove('rn-hotspot-highlight', 'rn-hotspot-dim');
      var oldLbl = el.querySelector('.rn-route-label');
      if (oldLbl) oldLbl.parentNode.removeChild(oldLbl);

      if (!nextSceneId) return; // at destination, no highlights needed

      if (target === nextSceneId) {
        // ✅ This is the correct next hotspot — green glow
        el.classList.add('rn-hotspot-highlight');

        var lbl = document.createElement('div');
        lbl.className   = 'rn-route-label';
        lbl.textContent = 'GO → ' + getName(nextSceneId);
        el.appendChild(lbl);

      } else if (target) {
        // ❎ Other hotspots are dimmed but still clickable
        el.classList.add('rn-hotspot-dim');
      }
    });
  }

  function clearHighlighting() {
    document.querySelectorAll('.link-hotspot').forEach(function (el) {
      el.classList.remove('rn-hotspot-highlight', 'rn-hotspot-dim');
      var lbl = el.querySelector('.rn-route-label');
      if (lbl) lbl.parentNode.removeChild(lbl);
    });
  }

  /* ──────────────────────────────────────────────────────────
   *  INIT  — wires up all buttons, populates dropdowns
   * ────────────────────────────────────────────────────────── */
  function init() {
    console.log('[RouteNav] Initialising v3...');

    // Sanity check: confirm window.campexSwitchScene is available
    if (!window.campexSwitchScene) {
      console.error('[RouteNav] window.campexSwitchScene not found! ' +
                    'Check index.js patch at the bottom of the IIFE.');
    } else {
      console.log('[RouteNav] campexSwitchScene API found ✅');
    }

    if (!window.CAMPUS_LOCATIONS) {
      console.error('[RouteNav] window.CAMPUS_LOCATIONS not found! Check routeData.js loaded.');
    }

    populateDropdowns();
    initCardToggle();

    // ── Start Tour button ─────────────────────────────────
    var startBtn = document.getElementById('startTourBtn');
    if (startBtn) {
      startBtn.addEventListener('click', onStartTourClick);
      console.log('[RouteNav] Start Tour button listener attached');
    } else {
      console.error('[RouteNav] #startTourBtn not found in DOM!');
    }

    // ── Clear Route button ────────────────────────────────
    var clearBtn = document.getElementById('clearRouteBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        clearRoute();
      });
    }

    console.log('[RouteNav] ✅ Ready (v3)');
  }

  // Run init after DOM is fully parsed (scripts are at bottom of body,
  // so DOM is ready, but use DOMContentLoaded as safety net)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
