// ==UserScript==
// @name         YouTube Error Auto-Refresh
// @namespace    https://github.com/joobert/userscripts/
// @version      2.0.0
// @description  Reloads YouTube when the player reports that content is unavailable, with loop protection and SPA support.
// @author       joobert
// @supportURL   https://github.com/joobert/userscripts/issues
// @downloadURL  https://github.com/joobert/userscripts/raw/refs/heads/main/scripts/YouTube%20Error%20Auto-Refresh.user.js
// @updateURL    https://github.com/joobert/userscripts/raw/refs/heads/main/scripts/YouTube%20Error%20Auto-Refresh.user.js
// @license      MIT
// @match        https://www.youtube.com/watch*
// @grant        none
// @run-at       document-start
// ==/UserScript==

;(() => {
  'use strict'

  const ERROR_TEXT_EXACT = "This content isn't available, try again later."
  const ERROR_TEXT_LOOSE = "content isn't available" // fallback partial match
  const CHECK_EVERY_MS = 1200

  // Anti-loop: exponential-ish cooldown + max attempts window
  const BASE_COOLDOWN_MS = 4000
  const MAX_RELOADS_PER_10_MIN = 8
  const WINDOW_MS = 10 * 60 * 1000
  const LS_KEY = 'yt_auto_refresh_reload_times_v2'

  const log = (...args) => console.log('[YT Auto-Refresh]', ...args)

  function now() {
    return Date.now()
  }

  function loadTimes() {
    try {
      const arr = JSON.parse(localStorage.getItem(LS_KEY) || '[]')
      return Array.isArray(arr) ? arr : []
    } catch {
      return []
    }
  }

  function saveTimes(times) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(times))
    } catch {}
  }

  function canReload() {
    const t = now()
    let times = loadTimes().filter((x) => t - x < WINDOW_MS)

    if (times.length >= MAX_RELOADS_PER_10_MIN) {
      log('Max reload limit hit; refusing to reload to avoid loops.')
      return false
    }

    // cooldown increases with how many reloads in the current window
    const cooldown = BASE_COOLDOWN_MS * Math.max(1, times.length)
    const last = times.length ? times[times.length - 1] : 0
    if (t - last < cooldown) return false

    times.push(t)
    saveTimes(times)
    return true
  }

  function triggerReload(reason) {
    if (!canReload()) return
    log(`Error detected (${reason}) -> reloading`)
    location.reload()
  }

  // ---- Shadow DOM traversal helpers ----
  function* deepElements(root = document.documentElement) {
    // BFS over DOM + shadow roots
    const q = [root]
    const seen = new Set()

    while (q.length) {
      const node = q.shift()
      if (!node || seen.has(node)) continue
      seen.add(node)

      if (node.nodeType === 1) {
        // Element
        yield node

        // Shadow root
        const sr = node.shadowRoot
        if (sr) q.push(sr)

        // Children (Element + DocumentFragment)
        // Use children if available, else childNodes.
        const kids = node.children ? Array.from(node.children) : Array.from(node.childNodes || [])
        for (const k of kids) q.push(k)
      } else if (node.nodeType === 11) {
        // DocumentFragment (shadow root)
        const kids = Array.from(node.childNodes || [])
        for (const k of kids) q.push(k)
      }
    }
  }

  function findErrorByTextDeep() {
    // Look for your specific yt-formatted-string#reason if accessible
    for (const el of deepElements()) {
      // Fast checks to keep it cheap:
      // - If it's yt-formatted-string or a known error container, check text.
      const tag = el.tagName
      if (!tag) continue

      if (
        tag === 'YT-FORMATTED-STRING' ||
        el.id === 'player-error-message-container' ||
        el.classList?.contains('ytp-error')
      ) {
        const t = (el.textContent || '').trim()
        if (!t) continue

        if (t === ERROR_TEXT_EXACT) return { match: 'exact', text: t, element: el }
        if (t.toLowerCase().includes(ERROR_TEXT_LOOSE))
          return { match: 'loose', text: t, element: el }
      }
    }
    return null
  }

  function findPlayerOverlayError() {
    // YouTube player overlay errors often live under #movie_player
    const moviePlayer = document.getElementById('movie_player')
    if (!moviePlayer) return null

    // Common ytp error nodes (varies over time)
    const candidates = moviePlayer.querySelectorAll?.(
      '.ytp-error, .ytp-error-content-wrap, .ytp-error-content, .ytp-error-content-wrap-reason, .ytp-error-message',
    )

    if (!candidates || !candidates.length) return null

    for (const el of candidates) {
      const t = (el.textContent || '').trim()
      if (!t) continue

      if (t === ERROR_TEXT_EXACT) return { match: 'exact-ytp', text: t, element: el }
      if (t.toLowerCase().includes(ERROR_TEXT_LOOSE))
        return { match: 'loose-ytp', text: t, element: el }
    }
    return null
  }

  function checkOnce() {
    // 1) Polymer error container (deep)
    const deepHit = findErrorByTextDeep()
    if (deepHit) return triggerReload(`deepText:${deepHit.match}`)

    // 2) Player overlay error
    const ytpHit = findPlayerOverlayError()
    if (ytpHit) return triggerReload(`ytpOverlay:${ytpHit.match}`)
  }

  // ---- SPA navigation hooks ----
  function hookSpa() {
    // YouTube fires these events in many builds
    window.addEventListener('yt-navigate-finish', () => setTimeout(checkOnce, 800))
    window.addEventListener('yt-page-data-updated', () => setTimeout(checkOnce, 800))
    document.addEventListener('readystatechange', () => setTimeout(checkOnce, 800))
  }

  // ---- Observer + interval (covers both “injected” and “toggled”) ----
  function startObserver() {
    const obs = new MutationObserver(() => checkOnce())
    obs.observe(document.documentElement, { subtree: true, childList: true, characterData: true })
    return obs
  }

  function start() {
    hookSpa()
    startObserver()
    setInterval(checkOnce, CHECK_EVERY_MS)
    setTimeout(checkOnce, 1500)
    log('armed')
  }

  // Document-start safe boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true })
  } else {
    start()
  }
})()
