// ==UserScript==
// @name         Sketchfab Model Ripper
// @namespace    https://github.com/joobert/userscripts/
// @description  Downloads Sketchfab model geometry and textures as a ZIP archive.
// @version      5.1.0
// @author       Risk & j00bert (All logic by Risk, UI modified by j00bert)
// @supportURL   https://github.com/joobert/userscripts/issues
// @downloadURL  https://github.com/joobert/userscripts/raw/refs/heads/main/scripts/Sketchfab%20Model%20Ripper.user.js
// @updateURL    https://github.com/joobert/userscripts/raw/refs/heads/main/scripts/Sketchfab%20Model%20Ripper.user.js
// @include      /^https?://(www\.)?sketchfab\.com/.*
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.1.5/jszip.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip-utils/0.0.2/jszip-utils.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/1.3.8/FileSaver.js
// @grant        unsafeWindow
// @grant        GM_download
// @run-at       document-start
// ==/UserScript==

var button_dw = false
var func_drawGeometry = /(this\._stateCache\.drawGeometry\(this\._graphicContext,t\))/g
var fund_drawArrays = /t\.drawArrays\(t\.TRIANGLES,0,6\)/g
//var func_renderInto1 = /x\.renderInto\(n,S,y/g;
var func_renderInto1 = /A\.renderInto\(n,E,R/g //20 jun 2023 fix
var func_renderInto2 = /g\.renderInto=function\(e,i,r/g
var func_getResourceImage = /getResourceImage:function\(e,t\){/g

var func_test = /apply:function\(e\){var t=e instanceof r\.Geometry;/g

var addbtnfunc
;(function () {
  'use strict'
  var window = unsafeWindow
  console.log('[ModelScript] init', window)

  window.allmodel = []
  var saveimagecache2 = {}
  var objects = {}
  var pendingTextureCaptures = []

  var saveimage_to_list = function (url, file_name) {
    if (!saveimagecache2[url]) {
      var mdl = {
        name: file_name,
      }

      saveimagecache2[url] = mdl
    }
  }

  addbtnfunc = function () {
    var vrBtn = document.querySelector('.general-controls .fullscreen')

    if (vrBtn && !button_dw) {
      console.log('[ModelScript] Adding "Download Model" button.')

      var btn = document.createElement('a')
      btn.setAttribute('class', 'control tooltip download-button')
      btn.setAttribute('data-tooltip', 'Download Model')

      btn.innerHTML = "<i class='viewer-icon-download'></i>"
      btn.addEventListener('click', dodownload, false)

      vrBtn.parentNode.insertBefore(btn, vrBtn)

      button_dw = true
    } else {
      console.log('[ModelScript] Couldn\'t add "Download Model" button, retrying...')
      setTimeout(addbtnfunc, 3000)
    }
  }

  var dodownload = async function () {
    console.log('[ModelScript] Download started.')
    var idx = 0
    window.allmodel.forEach(function (obj) {
      var mdl = {
        name: 'model_' + idx,
        obj: parseobj(obj),
      }
      console.log(mdl)
      dosavefile(mdl)
      idx++
    })
    await PackAll()
  }

  var PackAll = async function () {
    await Promise.all(pendingTextureCaptures)

    var zip = new JSZip()
    var folder = zip.folder('collection')

    for (var obj in objects) {
      console.log('[ModelScript] Saving file', obj)
      folder.file(obj, objects[obj], { binary: true })
    }

    var nameElement = document.querySelector('.model-name__label')
    var file_name = nameElement ? nameElement.textContent.trim() : 'sketchfab-model'
    var content = await zip.generateAsync({ type: 'blob' })
    saveAs(content, file_name + '.zip')
  }

  var parseobj = function (obj) {
    console.log('[ModelScript]: obj', obj)
    var list = []
    obj._primitives.forEach(function (p) {
      if (p && p.indices) {
        list.push({
          mode: p.mode,
          indices: p.indices._elements,
        })
      }
    })

    var attr = obj._attributes
    return {
      vertex: attr.Vertex._elements,
      normal: attr.Normal ? attr.Normal._elements : [],
      uv: attr.TexCoord0
        ? attr.TexCoord0._elements
        : attr.TexCoord1
          ? attr.TexCoord1._elements
          : attr.TexCoord2
            ? attr.TexCoord2._elements
            : attr.TexCoord2
              ? attr.TexCoord2._elements
              : attr.TexCoord3
                ? attr.TexCoord3._elements
                : attr.TexCoord4
                  ? attr.TexCoord4._elements
                  : attr.TexCoord5
                    ? attr.TexCoord5._elements
                    : attr.TexCoord6
                      ? attr.TexCoord6._elements
                      : attr.TexCoord7
                        ? attr.TexCoord7._elements
                        : attr.TexCoord8
                          ? attr.TexCoord8._elements
                          : [],
      primitives: list,
    }
  }

  var dosavefile = function (mdl) {
    var obj = mdl.obj

    //console.log("TEST");
    //console.log(obj);

    var str = ''
    str += 'mtllib ' + mdl.name + '.mtl\n'
    str += 'o ' + mdl.name + '\n'
    for (var i = 0; i < obj.vertex.length; i += 3) {
      str += 'v '
      for (var j = 0; j < 3; ++j) {
        str += obj.vertex[i + j] + ' '
      }
      str += '\n'
    }
    for (i = 0; i < obj.normal.length; i += 3) {
      str += 'vn '
      for (j = 0; j < 3; ++j) {
        str += obj.normal[i + j] + ' '
      }
      str += '\n'
    }

    for (i = 0; i < obj.uv.length; i += 2) {
      str += 'vt '
      for (j = 0; j < 2; ++j) {
        str += obj.uv[i + j] + ' '
      }
      str += '\n'
    }
    //str += 'usemtl ' + mdl.name + '\n';
    str += 's on \n'

    var vn = obj.normal.length != 0
    var vt = obj.uv.length != 0

    for (i = 0; i < obj.primitives.length; ++i) {
      var primitive = obj.primitives[i]
      if (primitive.mode == 4 || primitive.mode == 5) {
        var strip = primitive.mode == 5
        for (j = 0; j + 2 < primitive.indices.length; !strip ? (j += 3) : j++) {
          str += 'f '
          var order = [0, 1, 2]
          if (strip && j % 2 == 1) {
            order = [0, 2, 1]
          }
          for (var k = 0; k < 3; ++k) {
            var faceNum = primitive.indices[j + order[k]] + 1
            str += faceNum
            if (vn || vt) {
              str += '/'
              if (vt) {
                str += faceNum
              }
              if (vn) {
                str += '/' + faceNum
              }
            }
            str += ' '
          }
          str += '\n'
        }
      } else {
        console.log('[ModelScript] dosavefile: Unknown primitive mode', primitive)
      }
    }

    str += '\n'

    var objblob = new Blob([str], { type: 'text/plain' })

    objects[mdl.name + '.obj'] = objblob
  }

  window.attachbody = function (obj) {
    if (
      obj._faked != true &&
      ((obj.stateset && obj.stateset._name) || obj._name || (obj._parents && obj._parents[0]._name))
    ) {
      obj._faked = true
      if (obj._name == 'composer layer' || obj._name == 'Ground - Geometry') return
      window.allmodel.push(obj)
      console.log(obj)
    }
    //console.log(obj);
  }

  window.hook_test = function (e, idx) {
    console.log('hooked index: ' + idx)
    console.log(e)
  }
  window.drawhookcanvas = function (e, imagemodel) {
    if (
      (e.width == 128 && e.height == 128) ||
      (e.width == 32 && e.height == 32) ||
      (e.width == 64 && e.height == 64)
    ) {
      return e
    }
    if (imagemodel) {
      var alpha = e.options.format
      var filename_image = imagemodel.attributes.name
      var uid = imagemodel.attributes.uid
      var url_image = e.url
      var max_size = 0
      var obr = e
      imagemodel.attributes.images.forEach(function (img) {
        var alpha_is_check = alpha == 'A' ? img.options.format == alpha : true

        var d = img.width
        while (d % 2 == 0) {
          d = d / 2
        }

        if (img.size > max_size && alpha_is_check && d == 1) {
          max_size = img.size
          url_image = img.url
          uid = img.uid
          obr = img
        }
      })
      if (!saveimagecache2[url_image]) {
        console.log(e)
        saveimage_to_list(url_image, filename_image)
      } else {
        //console.log(e);
      }

      return obr
    }
    return e
  }

  window.drawhookimg = function (gl, t) {
    console.log(JSON.stringify(t))
    var url = t[5].currentSrc
    var width = t[5].width
    var height = t[5].height

    if (!saveimagecache2[url]) {
      //console.log("rejected:"+url);
      return
    } else {
      //console.log("saved texture:"+url);
    }

    var data = new Uint8Array(width * height * 4)
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data)

    var halfHeight = (height / 2) | 0 // the | 0 keeps the result an int
    var bytesPerRow = width * 4

    // make a temp buffer to hold one row
    var temp = new Uint8Array(width * 4)
    for (var y = 0; y < halfHeight; ++y) {
      var topOffset = y * bytesPerRow
      var bottomOffset = (height - y - 1) * bytesPerRow

      // make copy of a row on the top half
      temp.set(data.subarray(topOffset, topOffset + bytesPerRow))

      // copy a row from the bottom half to the top
      data.copyWithin(topOffset, bottomOffset, bottomOffset + bytesPerRow)

      // copy the copy of the top half row to the bottom half
      data.set(temp, bottomOffset)
    }

    // Create a 2D canvas to store the result
    var canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    var context = canvas.getContext('2d')

    // Copy the pixels to a 2D canvas
    var imageData = context.createImageData(width, height)
    imageData.data.set(data)
    context.putImageData(imageData, 0, 0)

    var re = /(?:\.([^.]+))?$/
    var ext = re.exec(saveimagecache2[url].name)[1]
    var name = saveimagecache2[url].name + '.png'

    if (ext == 'png' || ext == 'jpg' || ext == 'jpeg') {
      var ret = saveimagecache2[url].name.replace('.' + ext, '')
      name = ret + '.png'
    }
    console.log('[ModelScript] Saved texture to blob ' + name)
    var capture = new Promise(function (resolve) {
      canvas.toBlob(function (blob) {
        if (blob) {
          objects[name] = blob
        }
        resolve()
      }, 'image/png')
    })

    pendingTextureCaptures.push(capture)
  }
})()
;(() => {
  'use strict'
  const Event = class {
    constructor(script, target) {
      this.script = script
      this.target = target

      this._cancel = false
      this._replace = null
      this._stop = false
    }

    preventDefault() {
      this._cancel = true
    }
    stopPropagation() {
      this._stop = true
    }
    replacePayload(payload) {
      this._replace = payload
    }
  }

  let callbacks = []
  window.addBeforeScriptExecuteListener = (f) => {
    if (typeof f !== 'function') {
      throw new Error('Event handler must be a function.')
    }
    callbacks.push(f)
  }
  window.removeBeforeScriptExecuteListener = (f) => {
    let i = callbacks.length
    while (i--) {
      if (callbacks[i] === f) {
        callbacks.splice(i, 1)
      }
    }
  }

  const dispatch = (script, target) => {
    if (script.tagName !== 'SCRIPT') {
      return
    }

    const e = new Event(script, target)

    if (typeof window.onbeforescriptexecute === 'function') {
      try {
        window.onbeforescriptexecute(e)
      } catch (err) {
        console.error(err)
      }
    }

    for (const func of callbacks) {
      if (e._stop) {
        break
      }
      try {
        func(e)
      } catch (err) {
        console.error(err)
      }
    }

    if (e._cancel) {
      script.textContent = ''
      script.remove()
    } else if (typeof e._replace === 'string') {
      script.textContent = e._replace
    }
  }
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const n of m.addedNodes) {
        dispatch(n, m.target)
      }
    }
  })
  observer.observe(document, {
    childList: true,
    subtree: true,
  })
})()
;(() => {
  'use strict'

  window.onbeforescriptexecute = (e) => {
    var links_as_arr = Array.from(e.target.childNodes)

    links_as_arr.forEach(function (srimgc) {
      if (srimgc instanceof HTMLScriptElement) {
        if (srimgc.src.indexOf('web/dist/') >= 0 || srimgc.src.indexOf('standaloneViewer') >= 0) {
          e.preventDefault()
          e.stopPropagation()
          var req = new XMLHttpRequest()
          req.open('GET', srimgc.src, false)
          req.send('')
          var jstext = req.responseText
          var ret = func_renderInto1.exec(jstext)

          if (ret) {
            var index = ret.index + ret[0].length
            var head = jstext.slice(0, index)
            var tail = jstext.slice(index)
            jstext = head + ',i' + tail
            console.log('[ModelScript] Injection: patch_0 injected successfully ' + srimgc.src)
          }

          ret = func_renderInto2.exec(jstext)

          if (ret) {
            var index = ret.index + ret[0].length
            var head = jstext.slice(0, index)
            var tail = jstext.slice(index)
            jstext = head + ',image_data' + tail
            console.log('[ModelScript] Injection: patch_1 injected successfully ' + srimgc.src)
            if (!func_renderInto1.exec(jstext))
              console.log('[ModelScript] But patch_0 failed ' + srimgc.src)
          }

          ret = fund_drawArrays.exec(jstext)

          if (ret) {
            var index = ret.index + ret[0].length
            var head = jstext.slice(0, index)
            var tail = jstext.slice(index)
            jstext = head + ',window.drawhookimg(t,image_data)' + tail
            console.log('[ModelScript] Injection: patch_2 injected successfully ' + srimgc.src)
          }

          ret = func_getResourceImage.exec(jstext)

          if (ret) {
            var index = ret.index + ret[0].length
            var head = jstext.slice(0, index)
            var tail = jstext.slice(index)
            jstext = head + 'e = window.drawhookcanvas(e,this._imageModel);' + tail
            console.log('[ModelScript] Injection: patch_3 injected successfully ' + srimgc.src)
          }

          ret = func_drawGeometry.exec(jstext)

          if (ret) {
            var index1 = ret.index + ret[1].length
            var head1 = jstext.slice(0, index1)
            var tail1 = jstext.slice(index1)
            jstext = head1 + ';window.attachbody(t);' + tail1
            console.log('[ModelScript] Injection: patch_4 injected successfully ' + srimgc.src)
            setTimeout(addbtnfunc, 3000)
          }
          //ret = func_test.exec(jstext)
          var idx = 0
          // while (ret = func_test.exec(jstext))
          // {
          //     var index = ret.index + ret[0].length;
          //     var head = jstext.slice(0, index);
          //     var tail = jstext.slice(index);
          //     jstext = head +"window.attachbody(e);"+ tail;
          //     //jstext = head + "window.drawhook(e);" + tail;
          //     func_test.lastIndex = index + 1000;
          //     console.log("[ModelScript] Injection: patch_4 injected successfully" + srimgc.src);
          //     setTimeout(addbtnfunc, 3000);
          // }

          var obj = document.createElement('script')
          obj.type = 'text/javascript'
          obj.text = jstext
          document.getElementsByTagName('head')[0].appendChild(obj)
        }
      }
    })
  }
})()
