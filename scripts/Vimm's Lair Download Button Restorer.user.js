// ==UserScript==
// @name         Vimm's Lair Download Button Restorer
// @namespace    https://github.com/joobert/userscripts/
// @version      1.0
// @description  Restores the missing download button on supported Vimm's Lair Vault pages.
// @author       joobert
// @supportURL   https://github.com/joobert/userscripts/issues
// @downloadURL  https://raw.githubusercontent.com/joobert/userscripts/main/scripts/Vimm%27s%20Lair%20Download%20Button%20Restorer.user.js
// @updateURL    https://raw.githubusercontent.com/joobert/userscripts/main/scripts/Vimm%27s%20Lair%20Download%20Button%20Restorer.user.js
// @match        https://vimm.net/vault/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
;(function () {
  const downloadForm = document.querySelector('#dl_form')
  if (!downloadForm) {
    console.error('Download form not found.')
    return
  }

  // Check if a button already exists inside the form
  const existingButton = downloadForm.querySelector('button[type="submit"]')
  if (!existingButton) {
    downloadForm.insertAdjacentHTML(
      'beforeend',
      '<button type="submit" style="width:100px">Download</button>',
    )
  }
})()
