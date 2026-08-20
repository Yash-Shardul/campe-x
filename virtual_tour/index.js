/*
 * Copyright 2016 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

(function() {
  let currentAudio = null;
  let currentSceneData = null;
  let guidePlaying = false;

  var Marzipano = window.Marzipano;
  var bowser = window.bowser;
  var screenfull = window.screenfull;
  var data = window.APP_DATA;

  // Grab elements from DOM.
  var panoElement = document.querySelector('#pano');
  var sceneNameElement = document.querySelector('#titleBar .sceneName');
  var sceneListElement = document.querySelector('#sceneList');
  var sceneElements = document.querySelectorAll('#sceneList .scene-card');
  var sceneListToggleElement = document.querySelector('#sceneListToggle');
  var autorotateToggleElement = document.querySelector('#autorotateToggle');
  var fullscreenToggleElement = document.querySelector('#fullscreenToggle');

  // Detect desktop or mobile mode.
  if (window.matchMedia) {
    var setMode = function() {
      if (mql.matches) {
        document.body.classList.remove('desktop');
        document.body.classList.add('mobile');
      } else {
        document.body.classList.remove('mobile');
        document.body.classList.add('desktop');
      }
    };
    var mql = matchMedia("(max-width: 500px), (max-height: 500px)");
    setMode();
    mql.addListener(setMode);
  } else {
    document.body.classList.add('desktop');
  }

  // Detect whether we are on a touch device.
  document.body.classList.add('no-touch');
  window.addEventListener('touchstart', function() {
    document.body.classList.remove('no-touch');
    document.body.classList.add('touch');
  });

  // Use tooltip fallback mode on IE < 11.
  if (bowser.msie && parseFloat(bowser.version) < 11) {
    document.body.classList.add('tooltip-fallback');
  }

  // Viewer options.
  var viewerOpts = {
    controls: {
      mouseViewMode: data.settings.mouseViewMode
    }
  };

  // Initialize viewer.
  var viewer = new Marzipano.Viewer(panoElement, viewerOpts);

  // 🔥 VR Viewers (initially null)
  var viewerLeft = null;
  var viewerRight = null;
  var vrMode = false;
  var currentVRSceneLeft = null;
  var currentVRSceneRight = null;

  // To get Yaw and Pitch in console
  viewer.domElement().addEventListener('click', function (e) {

    const view = viewer.view();

    const coords = view.screenToCoordinates({
      x: e.clientX,
      y: e.clientY
    });

    if (coords) {
      console.log("📍 YAW:", coords.yaw);
      console.log("📍 PITCH:", coords.pitch);
    }
  });

  // Create scenes.
  var scenes = data.scenes.map(function(data) {
    var urlPrefix = "tiles";
    var source = Marzipano.ImageUrlSource.fromString(
      urlPrefix + "/" + data.id + "/{z}/{f}/{y}/{x}.jpg",
      { cubeMapPreviewUrl: urlPrefix + "/" + data.id + "/preview.jpg" });
    var geometry = new Marzipano.CubeGeometry(data.levels);

    var limiter = Marzipano.RectilinearView.limit.traditional(data.faceSize, 100*Math.PI/180, 120*Math.PI/180);
    var view = new Marzipano.RectilinearView(data.initialViewParameters, limiter);

    var scene = viewer.createScene({
      source: source,
      geometry: geometry,
      view: view,
      pinFirstLevel: true
    });

    // Create link hotspots.
    data.linkHotspots.forEach(function(hotspot) {
      var element = createLinkHotspotElement(hotspot);
      scene.hotspotContainer().createHotspot(element, { yaw: hotspot.yaw, pitch: hotspot.pitch });
    });

    // Create info hotspots.
    data.infoHotspots.forEach(function(hotspot) {
      var element = createInfoHotspotElement(hotspot);
      scene.hotspotContainer().createHotspot(element, { yaw: hotspot.yaw, pitch: hotspot.pitch });
    });

    return {
      data: data,
      scene: scene,
      view: view
    };
  });

  // Set up autorotate, if enabled.
  var autorotate = Marzipano.autorotate({
    yawSpeed: 0.03,
    targetPitch: 0,
    targetFov: Math.PI/2
  });
  if (data.settings.autorotateEnabled) {
    autorotateToggleElement.classList.add('enabled');
  }

  // Set handler for autorotate toggle.
  autorotateToggleElement.addEventListener('click', toggleAutorotate);

  // Set up fullscreen mode, if supported.
  if (screenfull.enabled && data.settings.fullscreenButton) {
    document.body.classList.add('fullscreen-enabled');
    fullscreenToggleElement.addEventListener('click', function() {
      screenfull.toggle();
    });
    screenfull.on('change', function() {
      if (screenfull.isFullscreen) {
        fullscreenToggleElement.classList.add('enabled');
      } else {
        fullscreenToggleElement.classList.remove('enabled');
      }
    });
  } else {
    document.body.classList.add('fullscreen-disabled');
  }

  // Set handler for scene list toggle.
  if (sceneListToggleElement) {
    sceneListToggleElement.addEventListener('click', toggleSceneList);
  }
  // Start with the scene list open on desktop.
  // if (!document.body.classList.contains('mobile')) {
  //   showSceneList();
  // }

  document.addEventListener("click", function (e) {

    const isClickInsideList = sceneListElement.contains(e.target);
    const isClickOnButton = sceneListToggleElement.contains(e.target);

    // If click is outside BOTH list and button → close
    if (!isClickInsideList && !isClickOnButton) {
      hideSceneList();
    }

  });

  // Set handler for scene switch.
  document.querySelectorAll('#sceneList .scene-card').forEach(function(el) {

    el.addEventListener('click', function() {

      const id = el.getAttribute('data-id');
      const scene = findSceneById(id);

      if (scene) {
        switchScene(scene);

        if (document.body.classList.contains('mobile')) {
          hideSceneList();
        }
      }

    });

  });

  // DOM elements for view controls.
  var viewUpElement = document.querySelector('#viewUp');
  var viewDownElement = document.querySelector('#viewDown');
  var viewLeftElement = document.querySelector('#viewLeft');
  var viewRightElement = document.querySelector('#viewRight');
  var viewInElement = document.querySelector('#viewIn');
  var viewOutElement = document.querySelector('#viewOut');

  // Dynamic parameters for controls.
  var velocity = 0.7;
  var friction = 3;

  // Associate view controls with elements.
  var controls = viewer.controls();
  controls.registerMethod('upElement',    new Marzipano.ElementPressControlMethod(viewUpElement,     'y', -velocity, friction), true);
  controls.registerMethod('downElement',  new Marzipano.ElementPressControlMethod(viewDownElement,   'y',  velocity, friction), true);
  controls.registerMethod('leftElement',  new Marzipano.ElementPressControlMethod(viewLeftElement,   'x', -velocity, friction), true);
  controls.registerMethod('rightElement', new Marzipano.ElementPressControlMethod(viewRightElement,  'x',  velocity, friction), true);
  controls.registerMethod('inElement',    new Marzipano.ElementPressControlMethod(viewInElement,  'zoom', -velocity, friction), true);
  controls.registerMethod('outElement',   new Marzipano.ElementPressControlMethod(viewOutElement, 'zoom',  velocity, friction), true);

  function sanitize(s) {
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;');
  }



  function switchScene(scene) {

    // Stop any playing audio
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      currentAudio = null;
    }
    // Hide guide popup if visible
    const guidePopup = document.getElementById("guidePopup");
    if (guidePopup) {
      guidePopup.style.display = "none";
      guidePopup.style.opacity = "0";
    }
    guidePlaying = false;

    // Store active scene
    currentSceneData = scene.data;

    // Default Marzipano switching logic
    stopAutorotate();
    scene.view.setParameters(scene.data.initialViewParameters);
    scene.scene.switchTo();
    // 🔥 Sync VR scenes
    if (vrMode && viewerLeft && viewerRight) {
      loadVRScene(scene.data.id);
    }
    startAutorotate();
    updateSceneName(scene);
    updateSceneList(scene);

    // Notify route navigation of the scene change
    if (typeof window.campexOnSceneChange === 'function') {
      window.campexOnSceneChange(scene.data.id);
    }
  }

  function updateSceneName(scene) {
    if (sceneNameElement) {
      sceneNameElement.innerHTML = sanitize(scene.data.name);
    }
  }

  function updateSceneList(scene) {
    for (var i = 0; i < sceneElements.length; i++) {
      var el = sceneElements[i];
      if (el.getAttribute('data-id') === scene.data.id) {
        el.classList.add('current');
      } else {
        el.classList.remove('current');
      }
    }
  }

  function showSceneList() {
    sceneListElement.classList.add('enabled');
    sceneListToggleElement.classList.add('enabled');
  }

  function hideSceneList() {
    sceneListElement.classList.remove('enabled');
    sceneListToggleElement.classList.remove('enabled');
  }

  function toggleSceneList() {
    sceneListElement.classList.toggle('enabled');
    sceneListToggleElement.classList.toggle('enabled');
  }

  function startAutorotate() {
    if (!autorotateToggleElement.classList.contains('enabled')) {
      return;
    }
    viewer.startMovement(autorotate);
    viewer.setIdleMovement(3000, autorotate);
  }

  function stopAutorotate() {
    viewer.stopMovement();
    viewer.setIdleMovement(Infinity);
  }

  function toggleAutorotate() {
    if (autorotateToggleElement.classList.contains('enabled')) {
      autorotateToggleElement.classList.remove('enabled');
      stopAutorotate();
    } else {
      autorotateToggleElement.classList.add('enabled');
      startAutorotate();
    }
  }

  function createLinkHotspotElement(hotspot) {
    
    // Create wrapper element to hold icon and tooltip.
    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot');
    wrapper.classList.add('link-hotspot');
    // Expose target scene ID so routeNavigation.js can highlight it
    wrapper.setAttribute('data-route-target', hotspot.target);

    // Create image element.
    var icon = document.createElement('img');
    icon.src = 'img/link.png';
    icon.classList.add('link-hotspot-icon');

    // Set rotation transform.
    var transformProperties = [ '-ms-transform', '-webkit-transform', 'transform' ];
    for (var i = 0; i < transformProperties.length; i++) {
      var property = transformProperties[i];
      icon.style[property] = 'rotate(' + hotspot.rotation + 'rad)';
    }

    // Add click event handler.
    wrapper.addEventListener('click', function() {
      switchScene(findSceneById(hotspot.target));
    });

    // Prevent touch and scroll events from reaching the parent element.
    // This prevents the view control logic from interfering with the hotspot.
    stopTouchAndScrollEventPropagation(wrapper);

    // // Create tooltip element.
    // var tooltip = document.createElement('div');
    // tooltip.classList.add('hotspot-tooltip');
    // tooltip.classList.add('link-hotspot-tooltip');
    // tooltip.innerHTML = findSceneDataById(hotspot.target).name;
    // wrapper.appendChild(icon);
    // wrapper.appendChild(tooltip);

    // ✅ Create tooltip ONLY if title exists
    if (hotspot.title && hotspot.title.trim() !== "") {
      var tooltip = document.createElement('div');
      tooltip.classList.add('hotspot-tooltip');
      tooltip.classList.add('link-hotspot-tooltip');
      tooltip.innerHTML = hotspot.title;
      wrapper.appendChild(tooltip);
    }
    wrapper.appendChild(icon);

    return wrapper;
  }

  
  function createInfoHotspotElement(hotspot) {

    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot', 'info-hotspot');

    var header = document.createElement('div');
    header.classList.add('info-hotspot-header');

    var iconWrapper = document.createElement('div');
    iconWrapper.classList.add('info-hotspot-icon-wrapper');

    var icon = document.createElement('img');
    icon.src = 'img/info.png';
    icon.classList.add('info-hotspot-icon');

    iconWrapper.appendChild(icon);

    var titleWrapper = document.createElement('div');
    titleWrapper.classList.add('info-hotspot-title-wrapper');

    var title = document.createElement('div');
    title.classList.add('info-hotspot-title');
    title.innerHTML = hotspot.title;

    titleWrapper.appendChild(title);

    var closeWrapper = document.createElement('div');
    closeWrapper.classList.add('info-hotspot-close-wrapper');

    var closeIcon = document.createElement('img');
    closeIcon.src = 'img/close.png';
    closeIcon.classList.add('info-hotspot-close-icon');

    closeWrapper.appendChild(closeIcon);

    header.appendChild(iconWrapper);
    header.appendChild(titleWrapper);
    header.appendChild(closeWrapper);

    var text = document.createElement('div');
    text.classList.add('info-hotspot-text');
    text.innerHTML = hotspot.text;

    wrapper.appendChild(header);
    wrapper.appendChild(text);

    // Default modal (existing behavior)
    var modal = document.createElement('div');
    modal.innerHTML = wrapper.innerHTML;
    modal.classList.add('info-hotspot-modal');
    document.body.appendChild(modal);

    var toggle = function() {
      wrapper.classList.toggle('visible');
      modal.classList.toggle('visible');
    };

    // 🔥 CONDITION LOGIC HERE
    header.addEventListener('click', function (e) {

      e.stopPropagation();

      // ❌ Only show popup if images exist
      if (!hotspot.images || hotspot.images.length === 0) return;

      // Remove old popup if exists
      let existing = document.getElementById("customPopup");
      if (existing) existing.remove();

      const popup = document.createElement("div");
      popup.id = "customPopup";

      popup.innerHTML = `
        <div id="popupOverlay"></div>
        <div id="popupBox">

          <!-- ✅ TITLE -->
          <h2 id="popupTitle">${hotspot.title}</h2>

          <!-- ✅ IMAGE -->
          <div id="popupImageContainer">
            <img id="popupImage" src="${hotspot.images[0]}" />
          </div>

          <!-- CONTROLS -->
          <div id="popupControls">
            <button id="prevBtn">◀</button>
            <button id="nextBtn">▶</button>
          </div>

          <button id="closePopup">Close</button>
        </div>
      `;

      document.body.appendChild(popup);

      let index = 0;
      const img = document.getElementById("popupImage");

      // ✅ AUTO CHANGE EVERY 2.5 SEC
      let interval = setInterval(() => {
        index = (index + 1) % hotspot.images.length;
        img.src = hotspot.images[index];
      }, 2500);

      // ✅ MANUAL CONTROLS
      document.getElementById("nextBtn").onclick = () => {
        index = (index + 1) % hotspot.images.length;
        img.src = hotspot.images[index];
      };

      document.getElementById("prevBtn").onclick = () => {
        index = (index - 1 + hotspot.images.length) % hotspot.images.length;
        img.src = hotspot.images[index];
      };

      // ✅ CLOSE (IMPORTANT: stop interval)
      const closePopup = () => {
        clearInterval(interval);
        popup.remove();
      };

      document.getElementById("closePopup").onclick = closePopup;
      document.getElementById("popupOverlay").onclick = closePopup;
    });

    modal.querySelector('.info-hotspot-close-wrapper')
      .addEventListener('click', toggle);

    stopTouchAndScrollEventPropagation(wrapper);

    return wrapper;
  }
  

  function stopTouchAndScrollEventPropagation(element) {
    var events = [
      'touchstart', 'touchmove', 'touchend', 'touchcancel',
      'wheel', 'mousewheel'
    ];

    events.forEach(function(eventName) {
      element.addEventListener(eventName, function(event) {
        event.stopPropagation();
      });
    });
  }

  function findSceneById(id) {
    for (var i = 0; i < scenes.length; i++) {
      if (scenes[i].data.id === id) {
        return scenes[i];
      }
    }
    return null;
  }

  function findSceneDataById(id) {
    for (var i = 0; i < data.scenes.length; i++) {
      if (data.scenes[i].id === id) {
        return data.scenes[i];
      }
    }
    return null;
  }

  // Display the initial scene.
  switchScene(scenes[0]);

  // ── Expose public API for routeNavigation.js ──────────────────────────
  window.campexSwitchScene = function (sceneId) {
    var scene = findSceneById(sceneId);
    if (scene) {
      switchScene(scene);
    } else {
      console.warn('[CampeX] campexSwitchScene: scene not found:', sceneId);
    }
  };

  window.campexGetCurrentSceneObj = function () {
    return currentSceneData;
  };

  window.campexGetViewer = function () {
    return viewer;
  };
  // ── End public API ────────────────────────────────────────────────────

   // 🎧 Visual + Audio Guide Logic
  const guideButton = document.getElementById("guideToggle");
  const guidePopup = document.getElementById("guidePopup");
  

  guideButton.addEventListener("click", () => {
    if (!currentSceneData) return;

    // If already playing, stop everything
    if (guidePlaying) {
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
      }
      guidePopup.style.display = "none";
      guideButton.querySelector("img").style.filter = "none";
      guidePlaying = false;
      return;
    }

    // Start guide
    guidePlaying = true;
    guideButton.querySelector("img").style.filter = "drop-shadow(0 0 6px #00e676)";

    // Stop existing audio if any
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }

    // Play scene-specific audio
    if (currentSceneData.audio) {
      currentAudio = new Audio(currentSceneData.audio);
      currentAudio.play().catch(err => {
        console.warn("Autoplay blocked until user interacts with page.", err);
      });

      currentAudio.onended = () => {
        guidePopup.style.display = "none";
        guideButton.querySelector("img").style.filter = "none";
        guidePlaying = false;
      };
    }

    // Show visual guide popup
    if (currentSceneData.guideText) {
      guidePopup.textContent = currentSceneData.guideText;
      guidePopup.style.display = "block";
      guidePopup.style.opacity = "1";
    }
  });

// ================= VR MODE =================

var viewerLeft = null;
var viewerRight = null;
var vrMode = false;
var currentSceneId = null;

document.getElementById("vrButton").addEventListener("click", function () {

  vrMode = true;

  const pano = document.getElementById("pano");
  const vrContainer = document.getElementById("vrContainer");

  const reticleLeft = document.getElementById("reticleLeft");
  const reticleRight = document.getElementById("reticleRight");

  pano.style.display = "none";
  vrContainer.style.display = "flex";

  if (reticleLeft) reticleLeft.style.display = "block";
  if (reticleRight) reticleRight.style.display = "block";

  startVR();

  // ================= FULLSCREEN =================
  const el = document.documentElement;

  if (el.requestFullscreen) el.requestFullscreen();
  else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  else if (el.msRequestFullscreen) el.msRequestFullscreen();

  // ================= POINTER LOCK =================
  const container = document.getElementById("vrContainer");

  setTimeout(() => {
    if (container.requestPointerLock) {
      container.requestPointerLock();
    }
  }, 300);
});


// ================= 🔥 SINGLE EXIT FUNCTION =================
function exitVRCompletely() {

  if (!vrMode) return;

  vrMode = false;

  const pano = document.getElementById("pano");
  const vrContainer = document.getElementById("vrContainer");

  const reticleLeft = document.getElementById("reticleLeft");
  const reticleRight = document.getElementById("reticleRight");

  // 🔥 exit fullscreen
  if (document.fullscreenElement) {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    else if (document.msExitFullscreen) document.msExitFullscreen();
  }

  // 🔥 PRELOAD SCENE (INSTANT - NO TRANSITION)
  if (typeof switchScene === "function" && currentSceneId) {

    const targetScene = scenes.find(s => s.data.id === currentSceneId);

    if (targetScene) {
      pano.style.display = "none";
      switchScene(targetScene, true); // 🔥 KEY FIX (instant)
    }
  }

  // 🔥 SWITCH UI
  pano.style.display = "block";
  vrContainer.style.display = "none";

  if (reticleLeft) reticleLeft.style.display = "none";
  if (reticleRight) reticleRight.style.display = "none";

  // 🔥 release pointer lock
  if (document.pointerLockElement) {
    document.exitPointerLock();
  }

  // 🔥 destroy VR viewers
  if (viewerLeft) {
    viewerLeft.destroy();
    viewerLeft = null;
  }
  if (viewerRight) {
    viewerRight.destroy();
    viewerRight = null;
  }

  // 🔥 FIX BLACK SCREEN
  setTimeout(() => {
    window.dispatchEvent(new Event("resize"));
  }, 50);
}


// ================= ESC HANDLER =================
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") {
    exitVRCompletely();
  }
});


// ================= FULLSCREEN CHANGE =================
document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement && vrMode) {
    exitVRCompletely();
  }
});


// ================= START VR =================
function startVR() {

  var leftEl = document.getElementById("leftView");
  var rightEl = document.getElementById("rightView");

  viewerLeft = new Marzipano.Viewer(leftEl);
  viewerRight = new Marzipano.Viewer(rightEl);

  viewerLeft._domElement.style.overflow = "hidden";
  viewerRight._domElement.style.overflow = "hidden";

  var sceneData = currentSceneData || data.scenes[0];

  currentSceneId = sceneData.id;

  loadVRScene(sceneData.id);
}


// ================= LOAD SCENE =================
function loadVRScene(sceneId) {

  var sceneData = data.scenes.find(s => s.id === sceneId);
  if (!sceneData) return;

  currentSceneData = sceneData;
  currentSceneId = sceneId;

  var source = Marzipano.ImageUrlSource.fromString(
    "tiles/" + sceneData.id + "/{z}/{f}/{y}/{x}.jpg",
    { cubeMapPreviewUrl: "tiles/" + sceneData.id + "/preview.jpg" }
  );

  var geometry = new Marzipano.CubeGeometry(sceneData.levels);

  var viewLeft = new Marzipano.RectilinearView(sceneData.initialViewParameters);
  var viewRight = new Marzipano.RectilinearView(sceneData.initialViewParameters);

  viewLeft.setParameters({
    yaw: sceneData.initialViewParameters.yaw - 0.03,
    pitch: sceneData.initialViewParameters.pitch,
    fov: sceneData.initialViewParameters.fov
  });

  viewRight.setParameters({
    yaw: sceneData.initialViewParameters.yaw + 0.03,
    pitch: sceneData.initialViewParameters.pitch,
    fov: sceneData.initialViewParameters.fov
  });

  var sceneLeft = viewerLeft.createScene({ source, geometry, view: viewLeft });
  var sceneRight = viewerRight.createScene({ source, geometry, view: viewRight });

  (sceneData.linkHotspots || []).forEach(function(h) {

    var el1 = createLinkHotspotElement(h);
    el1.dataset.target = h.target;

    var el2 = createLinkHotspotElement(h);
    el2.dataset.target = h.target;

    el1.addEventListener("click", () => currentSceneId = h.target);
    el2.addEventListener("click", () => currentSceneId = h.target);

    sceneLeft.hotspotContainer().createHotspot(el1, { yaw: h.yaw, pitch: h.pitch });
    sceneRight.hotspotContainer().createHotspot(el2, { yaw: h.yaw, pitch: h.pitch });
  });

  (sceneData.infoHotspots || []).forEach(function(h) {
    var el1 = createInfoHotspotElement(h);
    var el2 = createInfoHotspotElement(h);

    sceneLeft.hotspotContainer().createHotspot(el1, { yaw: h.yaw, pitch: h.pitch });
    sceneRight.hotspotContainer().createHotspot(el2, { yaw: h.yaw, pitch: h.pitch });
  });

  sceneLeft.switchTo();
  sceneRight.switchTo();

  syncVRMovement(viewLeft, viewRight);
  enableMouseVRControl(viewLeft, viewRight);
}


// ================= SYNC =================
function syncVRMovement(viewLeft, viewRight) {

  function loop() {
    if (!vrMode) return;

    var p = viewLeft.parameters();

    viewRight.setParameters({
      yaw: p.yaw + 0.03,
      pitch: p.pitch,
      fov: p.fov
    });

    requestAnimationFrame(loop);
  }

  loop();
}


// ================= MOUSE CONTROL =================
function enableMouseVRControl(viewLeft, viewRight) {

  const container = document.getElementById("vrContainer");

  container.addEventListener("click", () => {
    container.requestPointerLock();
  });

  let yaw = viewLeft.parameters().yaw;
  let pitch = viewLeft.parameters().pitch;

  document.addEventListener("mousemove", function (e) {

    if (!vrMode) return;
    if (document.pointerLockElement !== container) return;

    yaw -= (e.movementX || 0) * 0.002;
    pitch -= (e.movementY || 0) * 0.002;

    pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));

    viewLeft.setParameters({ yaw, pitch });
    viewRight.setParameters({ yaw: yaw + 0.03, pitch });
  });
}
  // ================= GAZE =================
  let gazeTimer = null;
  let activeEl = null;

  function startGazeNavigation() {

    function checkGaze() {

      if (!vrMode) {
        requestAnimationFrame(checkGaze);
        return;
      }

      const hotspots = document.querySelectorAll("#leftView .hotspot");

      const rect = document.getElementById("leftView").getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      let found = null;

      hotspots.forEach(el => {
        const r = el.getBoundingClientRect();
        const hx = r.left + r.width / 2;
        const hy = r.top + r.height / 2;

        if (Math.abs(hx - centerX) < 25 && Math.abs(hy - centerY) < 25) {
          found = el;
        }
      });

      const reticleLeft = document.getElementById("reticleLeft");
      const reticleRight = document.getElementById("reticleRight");

      if (found) {

        if (activeEl !== found) {

          activeEl = found;
          clearTimeout(gazeTimer);

          reticleLeft?.classList.add("loading");
          reticleRight?.classList.add("loading");

          gazeTimer = setTimeout(() => {

            reticleLeft?.classList.remove("loading");
            reticleRight?.classList.remove("loading");

            const target = found.dataset.target;

            if (target) {
              loadVRScene(target);
              return;
            }

            if (found.classList.contains("info-hotspot")) {
              found.click();
            }

          }, 1800);
        }

      } else {

        activeEl = null;
        clearTimeout(gazeTimer);

        reticleLeft?.classList.remove("loading");
        reticleRight?.classList.remove("loading");
      }

      requestAnimationFrame(checkGaze);
    }

    checkGaze();
  }


  // ================= CLICK =================
  document.addEventListener("click", function () {

    if (!vrMode || !activeEl) return;

    const target = activeEl.dataset.target;

    if (target) {
      loadVRScene(target);
      return;
    }

    if (activeEl.classList.contains("info-hotspot")) {
      activeEl.click();
    }
  });

  startGazeNavigation();

})();
