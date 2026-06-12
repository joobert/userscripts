// ==UserScript==
// @name         Greasy Fork User Profile ZIP Downloader
// @namespace    https://github.com/joobert/userscripts/
// @version      1.2.0
// @description  Downloads every script listed on a Greasy Fork user profile as a ZIP archive.
// @author       joobert
// @supportURL   https://github.com/joobert/userscripts/issues
// @downloadURL  https://github.com/joobert/userscripts/raw/refs/heads/main/scripts/Greasy%20Fork%20User%20Profile%20ZIP%20Downloader.user.js
// @updateURL    https://github.com/joobert/userscripts/raw/refs/heads/main/scripts/Greasy%20Fork%20User%20Profile%20ZIP%20Downloader.user.js
// @license      MIT
// @match        https://greasyfork.org/*/users/*
// @require      https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

;(async function () {
  'use strict'

  const DELAY_MS = 250

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  function safeFilename(name) {
    return String(name || 'script')
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 170)
  }

  function getScriptId(url) {
    return new URL(url, location.href).pathname.match(/\/scripts\/(\d+)/)?.[1] || 'unknown'
  }

  function getCodeUrl(scriptUrl) {
    const url = new URL(scriptUrl, location.href)
    url.hash = ''
    url.search = ''
    url.pathname = url.pathname.replace(/\/$/, '') + '/code'
    return url.href
  }

  function getScriptLinksFromDoc(doc, baseUrl = location.href) {
    const found = new Map()

    for (const el of doc.querySelectorAll('.script-link')) {
      const href = el.getAttribute('href')
      if (!href) continue

      const url = new URL(href, baseUrl)

      if (!url.pathname.includes('/scripts/')) continue
      if (url.pathname.endsWith('/code')) continue

      const id = getScriptId(url.href)

      found.set(id, {
        id,
        title: el.textContent.trim() || `script-${id}`,
        pageUrl: url.href,
        codeUrl: getCodeUrl(url.href),
      })
    }

    return [...found.values()]
  }

  function getProfilePaginationUrls(doc) {
    const urls = new Set([location.href])
    const current = new URL(location.href)

    for (const a of doc.querySelectorAll('a[href*="page="]')) {
      const url = new URL(a.getAttribute('href'), location.href)

      if (url.origin === current.origin && url.pathname === current.pathname) {
        urls.add(url.href)
      }
    }

    return [...urls]
  }

  async function fetchDoc(url) {
    const res = await fetch(url, { credentials: 'include' })

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} while fetching ${url}`)
    }

    const html = await res.text()
    return new DOMParser().parseFromString(html, 'text/html')
  }

  function extractCodeFromCodePage(doc) {
    const container = doc.querySelector('div.code-container')

    if (!container) {
      throw new Error('Could not find div.code-container')
    }

    const preOrCode = container.querySelector('pre, code')

    let code = preOrCode
      ? preOrCode.innerText || preOrCode.textContent
      : container.innerText || container.textContent

    return code
      .replace(/\u00a0/g, ' ')
      .replace(/\r\n/g, '\n')
      .replace(/^\n+/, '')
      .replace(/\n+$/, '\n')
  }

  function getMetaValue(code, key) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    const jsMeta = code.match(new RegExp(`^\\/\\/\\s*@${escapedKey}\\s+(.+)$`, 'm'))

    if (jsMeta) return jsMeta[1].trim()

    const cssMeta = code.match(new RegExp(`^\\s*\\*\\s*@${escapedKey}\\s+(.+)$`, 'm'))

    return cssMeta ? cssMeta[1].trim() : ''
  }

  function getExtension(code) {
    if (/==UserStyle==/.test(code)) return '.user.css'
    return '.user.js'
  }

  async function collectAllScriptLinks(status) {
    const scripts = new Map()

    status.textContent = 'Scanning profile scripts...'

    for (const script of getScriptLinksFromDoc(document, location.href)) {
      scripts.set(script.id, script)
    }

    const pageUrls = getProfilePaginationUrls(document)

    for (let i = 0; i < pageUrls.length; i++) {
      const pageUrl = pageUrls[i]

      if (pageUrl === location.href) continue

      status.textContent = `Scanning profile page ${i + 1}/${pageUrls.length}...`

      const doc = await fetchDoc(pageUrl)

      for (const script of getScriptLinksFromDoc(doc, pageUrl)) {
        scripts.set(script.id, script)
      }

      await sleep(DELAY_MS)
    }

    return [...scripts.values()]
  }

  async function downloadZip(button, status) {
    button.disabled = true

    try {
      const scripts = await collectAllScriptLinks(status)

      if (!scripts.length) {
        status.textContent = 'No .script-link entries found on this profile.'
        return
      }

      const zip = new JSZip()
      const failures = []

      for (let i = 0; i < scripts.length; i++) {
        const script = scripts[i]

        status.textContent = `Downloading ${i + 1}/${scripts.length}: ${script.title}`

        try {
          const codeDoc = await fetchDoc(script.codeUrl)
          const code = extractCodeFromCodePage(codeDoc)

          const metaName = getMetaValue(code, 'name')
          const name = safeFilename(metaName || script.title)
          const ext = getExtension(code)

          zip.file(`${script.id} - ${name}${ext}`, code)
        } catch (err) {
          failures.push(`${script.id} - ${script.title}\n${script.codeUrl}\n${err.message}\n`)
          console.error('Failed to download script:', script, err)
        }

        await sleep(DELAY_MS)
      }

      if (failures.length) {
        zip.file('_failed-downloads.txt', failures.join('\n'))
      }

      status.textContent = 'Building ZIP...'

      const blob = await zip.generateAsync({ type: 'blob' })

      const userSlug = location.pathname.match(/\/users\/([^/]+)/)?.[1] || 'greasyfork-user'

      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${safeFilename(userSlug)}-scripts.zip`

      document.body.appendChild(a)
      a.click()
      a.remove()

      setTimeout(() => URL.revokeObjectURL(a.href), 5000)

      const successCount = scripts.length - failures.length
      status.textContent = `Done. Saved ${successCount}/${scripts.length} scripts.`
    } catch (err) {
      console.error(err)
      status.textContent = `Error: ${err.message}`
    } finally {
      button.disabled = false
    }
  }

  function findProfileHeading() {
    return (
      document.querySelector('section.about-user h2') ||
      document.querySelector('.about-user h2') ||
      document.querySelector('#content h2') ||
      document.querySelector('main h2') ||
      document.querySelector('h2')
    )
  }

  function addButtonNearH2() {
    if (document.querySelector('#gf-profile-zip-downloader')) return

    const h2 = findProfileHeading()

    if (!h2) {
      console.warn('[GF ZIP] Could not find profile h2.')
      return
    }

    const wrapper = document.createElement('div')
    wrapper.id = 'gf-profile-zip-downloader'
    wrapper.style.margin = '0.5em 0 1em'

    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = 'Download scripts as ZIP'

    // Let Greasy Fork's native styling do most of the work.
    button.className = 'button'

    // Fallback styling if the site doesn't style button.button.
    button.style.cursor = 'pointer'
    button.style.font = 'inherit'

    const status = document.createElement('div')
    status.style.marginTop = '0.4em'
    status.style.fontSize = '0.9em'
    status.style.opacity = '0.8'

    button.addEventListener('click', () => downloadZip(button, status))

    wrapper.appendChild(button)
    wrapper.appendChild(status)

    h2.insertAdjacentElement('afterend', wrapper)
  }

  function boot() {
    addButtonNearH2()

    // Backup in case Greasy Fork mutates/finishes layout slightly after document-idle.
    setTimeout(addButtonNearH2, 500)
    setTimeout(addButtonNearH2, 1500)
  }

  boot()
})()
