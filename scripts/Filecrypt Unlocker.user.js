// ==UserScript==
// @name         Filecrypt Unlocker
// @description  Automatically decrypt links from a Filecrypt container.
// @icon         https://filecrypt.cc/favicon.ico
// @version      1.0
// @author       afkarxyz, joobert
// @namespace    https://github.com/joobert/userscripts/
// @supportURL   https://github.com/joobert/userscripts/issues
// @downloadURL  https://raw.githubusercontent.com/joobert/userscripts/main/scripts/Filecrypt%20Unlocker.user.js
// @updateURL    https://raw.githubusercontent.com/joobert/userscripts/main/scripts/Filecrypt%20Unlocker.user.js
// @license      MIT
// @match        https://*.filecrypt.cc/Container/*
// @match        https://*.filecrypt.to/Container/*
// @grant        GM_xmlhttpRequest
// @connect      dcrypt.it
// @run-at       document-idle
// ==/UserScript==

;(() => {
  'use strict'

  const DECRYPT_URL = 'http://dcrypt.it/decrypt/paste'

  const faviconUrl = (domain) => `https://www.google.com/s2/favicons?sz=32&domain=${domain}`

  const getDomain = (url) => {
    try {
      return new URL(url).hostname.replace('www.', '')
    } catch {
      return ''
    }
  }

  const request = (details) =>
    new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        timeout: 30000,
        ...details,
        onload: resolve,
        onerror: () => reject(new Error('Request failed')),
        ontimeout: () => reject(new Error('Request timed out')),
      })
    })

  const decryptDlc = async (dlcContent) => {
    const response = await request({
      method: 'POST',
      url: DECRYPT_URL,
      headers: {
        Accept: 'application/json, text/javascript, */*',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        Origin: 'http://dcrypt.it',
        Referer: 'http://dcrypt.it/',
      },
      data: new URLSearchParams({ content: dlcContent }).toString(),
    })

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`dcrypt.it responded with ${response.status}`)
    }

    let json
    try {
      json = JSON.parse(response.responseText)
    } catch {
      throw new Error('Invalid response from dcrypt.it')
    }

    const links = json?.success?.links
    if (!Array.isArray(links) || !links.length) {
      throw new Error('No links returned by dcrypt.it')
    }

    return links
  }

  const injectStyles = () => {
    const style = document.createElement('style')
    style.textContent = `
            #czx_decryptor,
            #czx_decryptor * { box-sizing: border-box; }
            #czx_decryptor { text-align: left; }
            #czx_decryptor button,
            #czx_decryptor a.czx_btn {
                cursor: pointer;
                font: inherit;
            }
            #czx_decryptor .czx_btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                min-height: var(--czx-height, 32px);
                padding: var(--czx-padding, 7px 14px);
                border-radius: 999px;
                border: 1px solid var(--czx-border, transparent);
                background: var(--czx-bg, #1c1c44);
                color: var(--czx-color, #ffffff);
                font-size: 12px;
                font-weight: 600;
                line-height: 1.2;
                text-decoration: none;
                white-space: nowrap;
                flex-shrink: 0;
                box-shadow: none;
                transition: background-color .18s ease, border-color .18s ease, color .18s ease;
            }
            #czx_decryptor .czx_btn:hover {
                background: var(--czx-bg-hover, var(--czx-bg, #26265a));
                border-color: var(--czx-border-hover, var(--czx-border, transparent));
                color: var(--czx-color-hover, var(--czx-color, #ffffff));
                text-decoration: none;
            }
            #czx_decryptor .czx_row {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 10px;
                border: 1px solid #1d4e6c;
                border-radius: 16px;
                background: #0d1a28;
                min-width: 0;
                text-align: left;
                transition: background-color .18s ease, border-color .18s ease;
            }
            #czx_decryptor .czx_row:hover {
                background: #112235;
                border-color: #1fa1e1;
            }
            #czx_decryptor .czx_link_text {
                flex: 1;
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                color: #ffffff;
                font-size: 11px;
                text-align: left;
            }
            #czx_decryptor .czx_check {
                appearance: none;
                -webkit-appearance: none;
                width: 17px;
                height: 17px;
                margin: 0;
                border: 1.5px solid #53b121;
                border-radius: 999px;
                background: #0b1521;
                cursor: pointer;
                flex-shrink: 0;
                transition: background-color .18s ease, border-color .18s ease;
            }
            #czx_decryptor .czx_check:checked {
                border-color: #76ce42;
                background: #53b121;
            }
            #czx_decryptor .czx_check:focus-visible {
                outline: 1px solid #1fa1e1;
                outline-offset: 1px;
            }
            #czx_link_list::-webkit-scrollbar { width: 5px; }
            #czx_link_list::-webkit-scrollbar-track { background: #09131a; border-radius: 4px; }
            #czx_link_list::-webkit-scrollbar-thumb { background: #1fa1e1; border-radius: 4px; }
        `
    document.head.appendChild(style)
  }

  const waitFor = (selector, timeout = 10000) =>
    new Promise((resolve, reject) => {
      const el = document.querySelector(selector)
      if (el) return resolve(el)
      const obs = new MutationObserver(() => {
        const found = document.querySelector(selector)
        if (found) {
          obs.disconnect()
          resolve(found)
        }
      })
      obs.observe(document, { childList: true, subtree: true })
      setTimeout(() => {
        obs.disconnect()
        reject('timeout')
      }, timeout)
    })

  const findTableWidthSource = (box) => {
    const scope = box?.parentElement ?? document
    const row =
      scope.querySelector('tbody tr.kwj3, tr.kwj3') ||
      document.querySelector('tbody tr.kwj3, tr.kwj3')

    return row?.closest('table') || scope.querySelector('table') || document.querySelector('table')
  }

  const syncUIWidth = (box) => {
    const table = findTableWidthSource(box)
    const tableWidth = table?.getBoundingClientRect?.().width

    if (tableWidth && tableWidth > 0) {
      const width = `${Math.round(tableWidth)}px`
      box.style.width = width
      box.style.maxWidth = width
      return
    }

    box.style.width = '100%'
    box.style.maxWidth = '100%'
  }

  const setCompactState = (box) => {
    const header = box.querySelector('#czx_header')
    const actions = box.querySelector('#czx_actions')
    const listDiv = box.querySelector('#czx_link_list')

    box.style.padding = '12px 18px'
    if (header) header.style.display = 'none'
    if (actions) actions.style.display = 'none'

    listDiv.style.display = 'flex'
    listDiv.style.alignItems = 'center'
    listDiv.style.justifyContent = 'center'
    listDiv.style.flexDirection = 'column'
    listDiv.style.gap = '0'
    listDiv.style.maxHeight = 'none'
    listDiv.style.minHeight = '40px'
    listDiv.style.overflowY = 'visible'
    listDiv.style.paddingRight = '0'
    listDiv.style.textAlign = 'center'
  }

  const setExpandedState = (box) => {
    const header = box.querySelector('#czx_header')
    const actions = box.querySelector('#czx_actions')
    const listDiv = box.querySelector('#czx_link_list')

    box.style.padding = '20px'
    if (header) header.style.display = 'flex'
    if (actions) actions.style.display = 'flex'

    listDiv.style.display = 'flex'
    listDiv.style.flexDirection = 'column'
    listDiv.style.alignItems = 'stretch'
    listDiv.style.justifyContent = 'flex-start'
    listDiv.style.gap = '5px'
    listDiv.style.maxHeight = '360px'
    listDiv.style.minHeight = '0'
    listDiv.style.overflowY = 'auto'
    listDiv.style.paddingRight = '4px'
    listDiv.style.textAlign = 'left'
  }

  const buildUI = () => {
    const box = document.createElement('div')
    box.id = 'czx_decryptor'
    box.style.cssText = `
            position: relative;
            background: #0b1624;
            border: 1px solid #256f98;
            border-radius: 14px;
            padding: 12px 18px;
            margin: 18px auto;
            width: 100%;
            min-width: 0;
            max-width: 100%;
            font-family: 'Segoe UI', system-ui, sans-serif;
            color: #ffffff;
            box-shadow: none;
            z-index: 999999;
        `
    box.innerHTML = `
            <div id="czx_header" style="display:none;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;flex-wrap:wrap;">
                <div style="display:flex;align-items:center;min-width:0;">
                    <span style="font-size:15px;font-weight:700;color:#ffffff;letter-spacing:.3px;">Filecrypt Unlocker</span>
                </div>

                <div id="czx_actions" style="display:none;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-left:auto;">
                    <button
                        id="czx_check_all"
                        class="czx_btn"
                        style="--czx-bg:#239edf;--czx-bg-hover:#2aaae8;--czx-border:#2baeea;--czx-border-hover:#66d8ff;--czx-color:#ffffff;--czx-color-hover:#ffffff;--czx-height:32px;--czx-padding:5px 14px;font-size:11px;">
                        Check All
                    </button>
                    <button
                        id="czx_uncheck_all"
                        class="czx_btn"
                        style="--czx-bg:#239edf;--czx-bg-hover:#2aaae8;--czx-border:#2baeea;--czx-border-hover:#66d8ff;--czx-color:#ffffff;--czx-color-hover:#ffffff;--czx-height:32px;--czx-padding:5px 14px;font-size:11px;">
                        Uncheck All
                    </button>
                    <button
                        id="czx_copy_all"
                        class="czx_btn"
                        style="--czx-bg:#0b1624;--czx-bg-hover:#239edf;--czx-border:#2baeea;--czx-border-hover:#66d8ff;--czx-color:#ffffff;--czx-color-hover:#ffffff;--czx-height:32px;--czx-padding:5px 14px;font-size:11px;">
                        Copy All Links
                    </button>
                    <button
                        id="czx_open_selected"
                        class="czx_btn"
                        style="--czx-bg:#0b1309;--czx-bg-hover:#5fca21;--czx-border:#63c729;--czx-border-hover:#84ea43;--czx-color:#ffffff;--czx-color-hover:#ffffff;--czx-height:32px;--czx-padding:5px 14px;font-size:11px;">
                        Open Selected URLs
                    </button>
                </div>
            </div>

            <div id="czx_link_list" style="
                display:flex;align-items:center;justify-content:center;
                min-height:40px;padding:6px 0;text-align:center;">
                <div style="color:#f2f4ff;font-size:12px;">
                    Decrypting...
                </div>
            </div>
        `
    return box
  }

  const renderLinks = (box, links) => {
    const listDiv = box.querySelector('#czx_link_list')
    const checkAllBtn = box.querySelector('#czx_check_all')
    const uncheckAllBtn = box.querySelector('#czx_uncheck_all')
    const openSelectedBtn = box.querySelector('#czx_open_selected')

    setExpandedState(box)
    listDiv.innerHTML = ''

    const updateOpenSelectedButton = () => {
      const checkedLinks = listDiv.querySelectorAll('.czx_check:checked').length
      openSelectedBtn.disabled = checkedLinks === 0
      openSelectedBtn.style.opacity = checkedLinks === 0 ? '0.55' : '1'
      openSelectedBtn.style.cursor = checkedLinks === 0 ? 'not-allowed' : 'pointer'
      openSelectedBtn.textContent = `Open Selected URL${checkedLinks !== 1 ? 's' : ''}${checkedLinks ? ` (${checkedLinks})` : ''}`
    }

    links.forEach((link, i) => {
      const domain = getDomain(link)
      const row = document.createElement('div')
      row.className = 'czx_row'
      row.style.fontSize = '12px'

      row.innerHTML = `
                <input type="checkbox" class="czx_check" data-link="${link}" checked aria-label="Select link ${i + 1}">
                <span style="color:#bfe9fb;min-width:22px;font-size:11px;">${String(i + 1).padStart(2, '0')}</span>
                ${
                  domain
                    ? `<img src="${faviconUrl(domain)}" width="16" height="16"
                            style="border-radius:3px;flex-shrink:0;"
                            onerror="this.style.display='none'">`
                    : ``
                }
                <span class="czx_link_text">${link}</span>
                <button
                    data-link="${link}"
                    class="czx_btn czx_open_one"
                    style="--czx-bg:#0b1309;--czx-bg-hover:#5fca21;--czx-border:#63c729;--czx-border-hover:#84ea43;--czx-color:#ffffff;--czx-color-hover:#ffffff;--czx-height:28px;--czx-padding:4px 12px;font-size:11px;">
                    Open
                </button>
                <button
                    data-link="${link}"
                    class="czx_btn czx_copy_one"
                    style="--czx-bg:#239edf;--czx-bg-hover:#2aaae8;--czx-border:#2baeea;--czx-border-hover:#66d8ff;--czx-color:#ffffff;--czx-color-hover:#ffffff;--czx-height:28px;--czx-padding:4px 12px;font-size:11px;">
                    Copy
                </button>
            `

      row.querySelector('.czx_link_text').title = link

      listDiv.appendChild(row)
    })

    updateOpenSelectedButton()

    checkAllBtn.onclick = () => {
      listDiv.querySelectorAll('.czx_check').forEach((input) => {
        input.checked = true
      })
      updateOpenSelectedButton()
    }

    uncheckAllBtn.onclick = () => {
      listDiv.querySelectorAll('.czx_check').forEach((input) => {
        input.checked = false
      })
      updateOpenSelectedButton()
    }

    box.querySelector('#czx_copy_all').onclick = () => {
      navigator.clipboard.writeText(links.join('\n')).then(() => {
        const btn = box.querySelector('#czx_copy_all')
        btn.textContent = 'Copied!'
        btn.style.setProperty('--czx-bg', '#5fca21')
        btn.style.setProperty('--czx-bg-hover', '#67d52a')
        btn.style.setProperty('--czx-border', '#63c729')
        btn.style.setProperty('--czx-border-hover', '#84ea43')
        btn.style.setProperty('--czx-color', '#ffffff')
        btn.style.setProperty('--czx-color-hover', '#ffffff')
        setTimeout(() => {
          btn.textContent = 'Copy All Links'
          btn.style.setProperty('--czx-bg', '#0b1624')
          btn.style.setProperty('--czx-bg-hover', '#239edf')
          btn.style.setProperty('--czx-border', '#2baeea')
          btn.style.setProperty('--czx-border-hover', '#66d8ff')
          btn.style.setProperty('--czx-color', '#ffffff')
          btn.style.setProperty('--czx-color-hover', '#ffffff')
        }, 2000)
      })
    }

    openSelectedBtn.onclick = () => {
      const checkedLinks = Array.from(listDiv.querySelectorAll('.czx_check:checked')).map(
        (input) => input.dataset.link,
      )
      if (!checkedLinks.length) return
      checkedLinks.forEach((link, i) => setTimeout(() => window.open(link, '_blank'), i * 160))
    }

    listDiv.addEventListener('click', (e) => {
      const check = e.target.closest('.czx_check')
      if (check) {
        e.stopPropagation()
        updateOpenSelectedButton()
        return
      }

      const openBtn = e.target.closest('.czx_open_one')
      if (openBtn) {
        window.open(openBtn.dataset.link, '_blank')
        return
      }

      const btn = e.target.closest('.czx_copy_one')
      if (!btn) return
      navigator.clipboard.writeText(btn.dataset.link).then(() => {
        const orig = btn.textContent
        btn.textContent = 'Copied'
        btn.style.setProperty('--czx-bg', '#5fca21')
        btn.style.setProperty('--czx-bg-hover', '#67d52a')
        btn.style.setProperty('--czx-border', '#63c729')
        btn.style.setProperty('--czx-border-hover', '#84ea43')
        btn.style.setProperty('--czx-color', '#ffffff')
        btn.style.setProperty('--czx-color-hover', '#ffffff')
        setTimeout(() => {
          btn.textContent = orig
          btn.style.setProperty('--czx-bg', '#239edf')
          btn.style.setProperty('--czx-bg-hover', '#2aaae8')
          btn.style.setProperty('--czx-border', '#2baeea')
          btn.style.setProperty('--czx-border-hover', '#66d8ff')
          btn.style.setProperty('--czx-color', '#ffffff')
          btn.style.setProperty('--czx-color-hover', '#ffffff')
        }, 1500)
      })
    })

    listDiv.addEventListener('change', (e) => {
      if (!e.target.matches('.czx_check')) return
      updateOpenSelectedButton()
    })
  }

  const renderError = (box, msg) => {
    const listDiv = box.querySelector('#czx_link_list')
    setCompactState(box)
    listDiv.innerHTML = `
            <div style="color:#cc4444;font-size:12px;padding:6px 0;">
                ${msg}
            </div>`
  }

  injectStyles()

  waitFor('.dlcdownload')
    .then(async (dlcButton) => {
      const attrs = dlcButton.getAttributeNames()
      const id = dlcButton.getAttribute(attrs[attrs.length - 1])
      const dlcUrl = `${window.location.origin}/DLC/${id}.html`

      const ui = buildUI()
      const btnsDiv = document.querySelector('.butt1ns')
      btnsDiv ? btnsDiv.insertAdjacentElement('afterend', ui) : document.body.prepend(ui)
      document.querySelector('.fiIItheadblockqueue4')?.remove()
      setCompactState(ui)
      syncUIWidth(ui)
      window.addEventListener('resize', () => syncUIWidth(ui), { passive: true })

      try {
        const dlcResponse = await fetch(dlcUrl, { credentials: 'include' })
        if (!dlcResponse.ok) throw new Error(`Filecrypt responded with ${dlcResponse.status}`)

        const dlcContent = await dlcResponse.text()
        if (!dlcContent.trim()) throw new Error('Empty DLC content returned by Filecrypt')

        const links = await decryptDlc(dlcContent)
        renderLinks(ui, links)
      } catch (err) {
        renderError(ui, err.message)
      }
    })
    .catch(() => {})
})()
