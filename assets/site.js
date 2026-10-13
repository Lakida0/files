/* ==========================================================================
   files.lakida.win — directory listing renderer
   Renders a card grid from an inline item array, with live search, sorting,
   breadcrumbs, file-type detection and an optional inline audio player.

   Usage:
     <script src=".../assets/site.js"></script>
     <script>
       DirectoryListing.init({
         base: '',                                    // path from this page to its dir
         audio: true,                                 // enable inline playback
         items: [
           { name: 'song.mp3', size: 1234, mtime: 1649401807 }
         ]
       });
     </script>

   Options
     base       {string}  path from the page to its own directory ('' or 'music/')
     items      {Array}   the entries to render
     title      {string}  sets document.title and #page-title
     audio      {boolean} add an inline player to every audio card

   Item fields
     name   {string}  required — display name
     href   {string}  optional — relative URL (defaults to the encoded name)
     dir    {boolean} optional — true for directories
     size   {number}  optional — bytes (0 / omitted for directories)
     mtime  {number}  optional — unix seconds
     kind   {string}  optional — force a type key (audio, video, archive, ...)
     badge  {string}  optional — short tag shown on the card
     audio  {boolean} optional — per-item override of the global audio option

   Duration
     Durations are read from the file's own header over a single HTTP range
     request (FLAC STREAMINFO, or the MP3 Xing/Info header). When a server does
     not honour range requests the read is skipped and no duration is shown.
   ========================================================================== */

(function () {
  'use strict';

  /* --- File type detection --------------------------------------------- */

  var EXT_KIND = {
    // audio
    mp3: 'audio', flac: 'audio', wav: 'audio', ogg: 'audio', m4a: 'audio',
    aac: 'audio', opus: 'audio', wma: 'audio', ape: 'audio', mid: 'audio',
    // video
    mp4: 'video', m4v: 'video', webm: 'video', mkv: 'video', mov: 'video',
    avi: 'video', m3u8: 'video', ts: 'video', m4s: 'video', flv: 'video',
    // image
    png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image',
    svg: 'image', ico: 'image', bmp: 'image', avif: 'image', tiff: 'image',
    // html / web
    html: 'html', htm: 'html', xhtml: 'html',
    // code
    js: 'code', mjs: 'code', cjs: 'code', css: 'code', json: 'code',
    ts: 'code', tsx: 'code', jsx: 'code', py: 'code', java: 'code',
    c: 'code', h: 'code', cpp: 'code', cs: 'code', go: 'code', rs: 'code',
    rb: 'code', php: 'code', sh: 'code', ps1: 'code', bat: 'code',
    // archives
    zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive',
    gz: 'archive', bz2: 'archive', xz: 'archive', iso: 'archive',
    // documents
    pdf: 'doc', doc: 'doc', docx: 'doc', xls: 'doc', xlsx: 'doc',
    ppt: 'doc', pptx: 'doc', txt: 'doc', md: 'doc', rtf: 'doc',
    epub: 'doc', mobi: 'doc',
    // data
    nbs: 'data', midi: 'data', csv: 'data', xml: 'data', yml: 'data',
    yaml: 'data', toml: 'data', db: 'data', sqlite: 'data', bin: 'data'
  };

  var KIND_LABEL = {
    folder: '文件夹', audio: '音频', video: '视频', image: '图片',
    html: '网页', code: '代码', archive: '压缩包', doc: '文档',
    data: '数据', other: '文件'
  };

  /* Monochrome stroke icons, 24x24 viewBox, drawn with currentColor. */
  var ICONS = {
    folder:
      '<path d="M3 7.5A2 2 0 0 1 5 5.5h3.6a2 2 0 0 1 1.5.7l1 1.2H19a2 2 0 0 1 2 2v7.1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    audio:
      '<path d="M9 18V6.4a1 1 0 0 1 .8-1l8-1.6a1 1 0 0 1 1.2 1V15"/>' +
      '<circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="15" r="2.5"/>',
    video:
      '<rect x="3" y="5" width="18" height="14" rx="2.5"/>' +
      '<path d="M10 9.6v4.8l4.2-2.4z"/>',
    image:
      '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/>' +
      '<circle cx="8.6" cy="10" r="1.6"/>' +
      '<path d="M4 16.8l4.6-4.1a2 2 0 0 1 2.7.05L16 17"/>' +
      '<path d="M14.5 14.2l1.7-1.5a2 2 0 0 1 2.7.05L21 14.4"/>',
    html:
      '<path d="M9.5 8.5L6 12l3.5 3.5"/><path d="M14.5 8.5L18 12l-3.5 3.5"/>',
    code:
      '<path d="M9.5 8.5L6 12l3.5 3.5"/><path d="M14.5 8.5L18 12l-3.5 3.5"/>' +
      '<path d="M13 6.5l-2 11"/>',
    archive:
      '<rect x="3.5" y="4" width="17" height="4.5" rx="1.4"/>' +
      '<path d="M5.2 8.5v9.6a1.9 1.9 0 0 0 1.9 1.9h9.8a1.9 1.9 0 0 0 1.9-1.9V8.5"/>' +
      '<path d="M10.4 12.4h3.2"/>',
    doc:
      '<path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8z"/>' +
      '<path d="M14 3.5V8h4.5"/><path d="M8.8 13h6.4"/><path d="M8.8 16.4h4.4"/>',
    data:
      '<ellipse cx="12" cy="6.6" rx="7.5" ry="3.1"/>' +
      '<path d="M4.5 6.6v10.8c0 1.7 3.4 3.1 7.5 3.1s7.5-1.4 7.5-3.1V6.6"/>' +
      '<path d="M4.5 12c0 1.7 3.4 3.1 7.5 3.1s7.5-1.4 7.5-3.1"/>',
    other:
      '<path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8z"/>' +
      '<path d="M14 3.5V8h4.5"/>',
    arrow:
      '<path d="M9 6l6 6-6 6"/>',
    up:
      '<path d="M15 6l-6 6 6 6"/>',
    play:
      '<path d="M7 4.5l13 7.5-13 7.5z"/>',
    pause:
      '<path d="M7.5 5h3.2v14H7.5zM13.3 5h3.2v14h-3.2z"/>',
    download:
      '<path d="M12 3.5v11"/><path d="M7.6 10.4L12 14.8l4.4-4.4"/>' +
      '<path d="M4.5 19.5h15"/>',
    close:
      '<path d="M6 6l12 12M18 6L6 18"/>'
  };

  function svg(paths, className) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"' +
      (className ? ' class="' + className + '"' : '') + '>' + paths + '</svg>';
  }

  function iconMarkup(kind) {
    var path = kind === 'folder' ? ICONS.folder : (ICONS[kind] || ICONS.other);
    return '<span class="ico">' + svg(path) + '</span>';
  }

  function extOf(name) {
    var i = name.lastIndexOf('.');
    if (i <= 0 || i === name.length - 1) return '';
    return name.slice(i + 1).toLowerCase();
  }

  function kindOf(item) {
    if (item.kind) return item.kind;
    if (item.dir) return 'folder';
    return EXT_KIND[extOf(item.name)] || 'other';
  }

  /* --- Formatting ------------------------------------------------------- */

  function formatSize(bytes) {
    if (!bytes || bytes <= 0) return '';
    var units = ['B', 'kB', 'MB', 'GB', 'TB'];
    var i = 0;
    var n = bytes;
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024;
      i++;
    }
    if (i === 0) return n + ' B';
    if (i === 1) return n.toFixed(1) + ' kB';
    if (i === 2) return n.toFixed(1) + ' MB';
    return n.toFixed(2) + ' ' + units[i];
  }

  function pad(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function formatDate(unixSeconds) {
    if (!unixSeconds) return '';
    var d = new Date(unixSeconds * 1000);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  /* mm:ss, or h:mm:ss past the hour. */
  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '--:--';
    var total = Math.floor(seconds);
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    if (h > 0) return h + ':' + pad(m) + ':' + pad(s);
    return m + ':' + pad(s);
  }

  /* Percent-encode a path segment the way a static server expects. */
  function encodePath(p) {
    return p.split('/').map(function (seg) {
      return encodeURIComponent(seg);
    }).join('/');
  }

  /* --- Element helpers -------------------------------------------------- */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function setHtml(node, markup) {
    node.innerHTML = markup;
    return node;
  }

  /* ======================================================================
     Duration probing
     Reads only the header bytes of a media file, so a 25 MB track costs a
     few kilobytes of transfer.
     ====================================================================== */

  var PROBE_BYTES = 128 * 1024;

  var MP3_BITRATES = {
    '1-1': [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 0],
    '1-2': [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 0],
    '1-3': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
    '2-1': [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, 0],
    '2-2': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
  };

  function parseFlac(view) {
    if (view.byteLength < 42) return null;
    // "fLaC"
    if (view.getUint32(0, false) !== 0x664c6143) return null;
    // First metadata block must be STREAMINFO (type 0).
    if ((view.getUint8(4) & 0x7f) !== 0) return null;

    var sampleRate = (view.getUint8(18) << 12) | (view.getUint8(19) << 4) |
      (view.getUint8(20) >> 4);
    var totalSamples = (view.getUint8(21) & 0x0f) * 4294967296 +
      view.getUint32(22, false);
    if (!sampleRate || !totalSamples) return null;
    return totalSamples / sampleRate;
  }

  function parseMp3Frame(view, offset) {
    if (offset + 4 > view.byteLength) return null;
    // 11-bit frame sync
    if (view.getUint8(offset) !== 0xff || (view.getUint8(offset + 1) & 0xe0) !== 0xe0) {
      return null;
    }
    var header = view.getUint32(offset, false) >>> 0;
    var versionBits = (header >> 19) & 3;
    var layerBits = (header >> 17) & 3;
    var bitrateIndex = (header >> 12) & 15;
    var sampleRateIndex = (header >> 10) & 3;
    var padding = (header >> 9) & 1;
    if (!versionBits || !layerBits || bitrateIndex === 15 || sampleRateIndex === 3) {
      return null;
    }

    var version = versionBits === 3 ? 1 : 2;
    var layer = 4 - layerBits; // 1 = Layer I, 3 = Layer III
    var sampleRates = version === 1
      ? [44100, 48000, 32000]
      : [22050, 24000, 16000];
    var sampleRate = sampleRates[sampleRateIndex];
    var table = MP3_BITRATES[version + '-' + layer];
    var bitrate = table && table[bitrateIndex];
    if (!bitrate || !sampleRate) return null;

    var frameLength;
    if (layer === 1) {
      frameLength = (Math.floor(12 * bitrate * 1000 / sampleRate) + padding) * 4;
    } else {
      var coefficient = layer === 3 && version === 2 ? 72 : 144;
      frameLength = Math.floor(coefficient * bitrate * 1000 / sampleRate) + padding;
    }
    if (frameLength <= 4) return null;

    return {
      version: version,
      layer: layer,
      sampleRate: sampleRate,
      bitrate: bitrate,
      frameLength: frameLength,
      samplesPerFrame: layer === 1 ? 384 : (layer === 3 && version === 2 ? 576 : 1152)
    };
  }

  /* Read the size of an ID3v2 tag (which may carry embedded artwork and be far
     larger than the probe window), or 0 when there is no tag. */
  function id3Size(view) {
    if (view.byteLength < 10) return 0;
    if (view.getUint8(0) !== 0x49 || view.getUint8(1) !== 0x44 ||
        view.getUint8(2) !== 0x33) {
      return 0;
    }
    // The tag size is a 28-bit synchsafe integer, excluding the 10-byte header.
    return 10 + ((view.getUint8(6) & 0x7f) << 21) +
      ((view.getUint8(7) & 0x7f) << 14) +
      ((view.getUint8(8) & 0x7f) << 7) +
      (view.getUint8(9) & 0x7f);
  }

  function parseMp3(view, fileByteLength) {
    // Step past any ID3v2 tag so the first MPEG frame can be located.
    var audioStart = id3Size(view);

    var limit = Math.min(view.byteLength - 4, audioStart + 65536);
    var offset = -1;
    var first = null;
    for (var i = audioStart; i <= limit; i++) {
      var frame = parseMp3Frame(view, i);
      if (frame) {
        offset = i;
        first = frame;
        break;
      }
    }
    // The tag pushed the audio beyond what was fetched; parseMediaHeader
    // retries with a range request anchored on id3Size().
    if (!first) return null;

    // A Xing/Info header inside the first frame is the authoritative source.
    var tag = offset + 4 + (first.version === 1 ? (first.layer === 1 ? 17 : 32)
                                                : (first.layer === 1 ? 9 : 17));
    if (tag + 16 <= view.byteLength) {
      var magic = view.getUint32(tag, false);
      var isXing = magic === 0x58696e67;      // "Xing"
      var isInfo = magic === 0x496e666f;      // "Info"
      if (isXing || isInfo) {
        var flags = view.getUint32(tag + 4, false);
        if (flags & 1) { // frame count present
          var frames = view.getUint32(tag + 8, false);
          if (frames > 0) {
            return frames * first.samplesPerFrame / first.sampleRate;
          }
        }
        if (flags & 2) { // byte count present: derive the average bitrate
          var headBytes = view.getUint32(tag + 12, false);
          if (headBytes > 0) {
            var headAvgBps = headBytes * 8 / (first.samplesPerFrame / first.sampleRate);
            if (headAvgBps > 0) {
              return fileByteLength * 8 / headAvgBps;
            }
          }
        }
      }
    }

    // No VBR header: walk whole frames across the probed window. Because only
    // the head of the file was fetched, a variable-bitrate file is scaled by
    // the average bitrate observed here rather than summed directly.
    var duration = 0;
    var bytesSeen = 0;
    var pos = offset;
    var counted = 0;
    var uniform = true;
    while (pos + 4 <= view.byteLength && counted < 4096) {
      var current = parseMp3Frame(view, pos);
      if (!current) break;
      if (current.bitrate !== first.bitrate) uniform = false;
      duration += current.samplesPerFrame / current.sampleRate;
      bytesSeen += current.frameLength;
      pos += current.frameLength;
      counted++;
    }
    // Too few frames in the probe window to be representative.
    if (counted < 4 || duration <= 0) return null;
    if (uniform) return duration;

    // Variable bitrate: extrapolate the sampled average bitrate over the file.
    var avgBitsPerSecond = bytesSeen * 8 / duration;
    if (!avgBitsPerSecond) return null;
    return (fileByteLength || bytesSeen) * 8 / avgBitsPerSecond;
  }

  function fetchRange(href, start, end, signal) {
    return fetch(href, {
      headers: { Range: 'bytes=' + start + '-' + end },
      signal: signal
    }).then(function (response) {
      if (!response.ok) return null;
      // Without range support the whole file would be downloaded.
      if (response.status !== 206) return null;
      // "bytes 0-262143/9047552" — the total is needed to scale a VBR file.
      var total = 0;
      var range = response.headers && response.headers.get
        ? response.headers.get('Content-Range')
        : null;
      if (range) {
        var m = /\/(\d+)\s*$/.exec(range);
        if (m) total = parseInt(m[1], 10) || 0;
      }
      return response.arrayBuffer().then(function (buffer) {
        return { buffer: buffer, total: total };
      });
    });
  }

  function probeDuration(href, signal) {
    if (typeof fetch !== 'function' || typeof ArrayBuffer !== 'function') {
      return Promise.resolve(null);
    }

    return fetchRange(href, 0, PROBE_BYTES - 1, signal).then(function (head) {
      if (!head || !head.buffer) return null;

      var seconds = parseMediaHeader(head.buffer, head.total);
      if (seconds !== null) return seconds;

      // An ID3v2 tag can be far larger than the probe, leaving the audio out
      // of reach. If its length is known, fetch the window that follows it.
      if (head.buffer.byteLength < 10) return null;
      var tagSize = id3Size(new DataView(head.buffer));
      if (!tagSize || tagSize <= head.buffer.byteLength) return null;

      return fetchRange(href, tagSize, tagSize + PROBE_BYTES - 1, signal)
        .then(function (tail) {
          if (!tail || !tail.buffer) return null;
          return parseMediaHeader(tail.buffer, tail.total);
        });
    }).catch(function () {
      return null;
    });
  }

  /* Parse a duration in seconds out of a header buffer, or null.
     fileByteLength is the size of the whole file when known. */
  function parseMediaHeader(buffer, fileByteLength) {
    if (!buffer || buffer.byteLength < 32) return null;
    var view = new DataView(buffer);
    var total = fileByteLength || buffer.byteLength;
    try {
      var seconds = parseFlac(view);
      if (seconds === null) seconds = parseMp3(view, total);
      if (seconds === null || !isFinite(seconds) || seconds <= 0) return null;
      return seconds;
    } catch (e) {
      return null;
    }
  }

  /* ======================================================================
     Audio player
     ====================================================================== */

  /* Exactly one track plays at a time; playing a new one stops the previous. */
  var activeTrack = null;
  var activeCancel = null;
  var nowBar = null;

  function fmtDuration(seconds) {
    var total = Math.round(seconds);
    if (total < 60) return total + ' 秒';
    return Math.floor(total / 60) + ' 分 ' + pad(total % 60) + ' 秒';
  }

  function ensureNowBar() {
    if (nowBar || !document.body) return nowBar;
    var bar = el('div', 'now-bar');
    bar.id = 'now-bar';
    bar.hidden = true;
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', '正在播放');

    var toggle = el('button', 'toggle');
    toggle.type = 'button';
    toggle.setAttribute('aria-label', '播放或暂停');
    setHtml(toggle, svg(ICONS.play, 'i-play') + svg(ICONS.pause, 'i-pause'));

    var info = el('div', 'now-info');
    var name = el('span', 'now-name');
    var seek = el('input', 'seek');
    seek.type = 'range';
    seek.min = '0';
    seek.max = '1000';
    seek.value = '0';
    seek.disabled = true;
    seek.setAttribute('aria-label', '播放进度');
    setHtml(info, '');
    info.appendChild(name);
    info.appendChild(seek);

    var time = el('div', 'track-time');
    var now = el('span', 'now');
    var sep = el('span', null, '/');
    var total = el('span', 'dur', '--:--');
    time.appendChild(now);
    time.appendChild(sep);
    time.appendChild(total);

    var close = el('button', 'icon-btn now-close');
    close.type = 'button';
    close.setAttribute('aria-label', '关闭播放器');
    close.title = '关闭';
    setHtml(close, svg(ICONS.close));

    bar.appendChild(toggle);
    bar.appendChild(info);
    bar.appendChild(time);
    bar.appendChild(close);
    document.body.appendChild(bar);
    document.body.classList.add('has-now-bar');

    // The bar mirrors whichever card is currently playing.
    var api = {
      root: bar,
      toggle: toggle,
      name: name,
      seek: seek,
      now: now,
      dur: total,
      close: close
    };

    toggle.addEventListener('click', function () {
      if (activeTrack) activeTrack.controls.toggle();
    });
    seek.addEventListener('input', function () {
      if (activeTrack) {
        activeTrack.controls.seekTo(Number(seek.value) / 1000);
      }
    });
    close.addEventListener('click', function () {
      if (activeTrack) activeTrack.controls.stop();
    });

    nowBar = api;
    return nowBar;
  }

  function showNowBar(track) {
    var bar = ensureNowBar();
    if (!bar) return;
    bar.root.hidden = false;
    bar.name.textContent = track.item.name;
    bar.name.title = track.item.name;
    if (document.title !== track.item.name) {
      bar.name.setAttribute('aria-live', 'polite');
    }
  }

  /* --- Per-card player --------------------------------------------------- */

  function createPlayer(item) {
    var audio = new Audio();
    audio.preload = 'metadata';
    audio.src = item.href;
    audio.volume = 1;

    var abort = typeof AbortController === 'function' ? new AbortController() : null;
    var seeking = false;
    var rafId = null;
    var duration = 0;        // authoritative, from the file header when known
    var mediaKnown = false;  // <audio> reported its own duration
    var track = null;

    var ui = {
      root: null,
      toggle: null,
      seek: null,
      now: null,
      dur: null,
      time: null,
      card: null
    };

    function effectiveDuration() {
      if (duration > 0) return duration;
      if (mediaKnown && isFinite(audio.duration) && audio.duration > 0) {
        return audio.duration;
      }
      return 0;
    }

    function paint() {
      var total = effectiveDuration();
      var current = audio.currentTime || 0;
      var ratio = total > 0 ? Math.min(1, current / total) : 0;

      if (ui.seek) {
        if (!seeking) ui.seek.value = String(Math.round(ratio * 1000));
        ui.seek.style.setProperty('--p', (ratio * 100).toFixed(2) + '%');
        ui.seek.disabled = total <= 0;
      }
      if (ui.now) ui.now.textContent = formatTime(current);
      if (ui.dur) ui.dur.textContent = total > 0 ? formatTime(total) : '--:--';

      // Mirror onto the global bar when this card owns playback.
      if (activeTrack && activeTrack.player === player && nowBar) {
        if (!seeking) nowBar.seek.value = String(Math.round(ratio * 1000));
        nowBar.seek.style.setProperty('--p', (ratio * 100).toFixed(2) + '%');
        nowBar.seek.disabled = total <= 0;
        nowBar.now.textContent = formatTime(current);
        nowBar.dur.textContent = total > 0 ? formatTime(total) : '--:--';
      }
    }

    function setPlaying(isPlaying) {
      if (ui.card) ui.card.classList.toggle('is-playing', isPlaying);
      if (ui.toggle) {
        ui.toggle.setAttribute('aria-pressed', isPlaying ? 'true' : 'false');
        ui.toggle.title = isPlaying ? '暂停' : '播放';
      }
      if (activeTrack && activeTrack.player === player && nowBar) {
        nowBar.toggle.setAttribute('aria-pressed', isPlaying ? 'true' : 'false');
      }
    }

    function tick() {
      if (audio.paused) {
        rafId = null;
        return;
      }
      paint();
      rafId = requestAnimationFrame(tick);
    }

    function startTick() {
      if (rafId === null) rafId = requestAnimationFrame(tick);
    }

    function stopTick() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    /* Pause every other card and hand the global bar to this one. */
    function claim() {
      if (activeTrack && activeTrack.player !== player) {
        activeTrack.player.halt();
      }
      activeTrack = { player: player, item: item, controls: controls, audio: audio };
      showNowBar(activeTrack);
    }

    function release() {
      if (activeTrack && activeTrack.player === player) {
        activeTrack = null;
        if (nowBar) nowBar.root.hidden = true;
      }
    }

    function play() {
      claim();
      var attempt = audio.play();
      if (attempt && typeof attempt.catch === 'function') {
        attempt.catch(function () {
          // Autoplay policy or a decode failure: fall back to a clean state.
          setPlaying(false);
          release();
          if (ui.dur) ui.dur.textContent = '播放失败';
        });
      }
    }

    /* Pause without giving up ownership of the bar, so playback can resume.
       Used when another track takes over. */
    function halt() {
      audio.pause();
      stopTick();
      setPlaying(false);
    }

    /* Pause and release the bar. Used when this card is paused on purpose. */
    function pause() {
      halt();
      release();
    }

    function stop() {
      pause();
      audio.currentTime = 0;
      paint();
    }
    function loadDuration() {
      if (duration > 0) return;
      probeDuration(item.href, abort ? abort.signal : undefined).then(function (seconds) {
        if (seconds === null || !ui.dur) return;
        duration = seconds;
        if (ui.time) ui.time.hidden = false;
        paint();
      });
    }

    /* --- element construction ------------------------------------------- */

    function buildCard() {
      var kind = kindOf(item);
      var label = KIND_LABEL[kind] || '文件';

      var li = el('li');
      var card = el('div', 'card is-audio');
      card.setAttribute('data-kind', kind);
      ui.card = card;

      var head = el('div', 'card-head');

      var toggle = el('button', 'toggle');
      toggle.type = 'button';
      toggle.setAttribute('aria-label', '播放 ' + item.name);
      toggle.title = '播放';
      toggle.setAttribute('aria-pressed', 'false');
      setHtml(toggle, svg(ICONS.play, 'i-play') + svg(ICONS.pause, 'i-pause'));
      ui.toggle = toggle;

      var body = el('div', 'card-body');
      var nameLink = el('a', 'card-name', item.name);
      nameLink.href = item.href;
      nameLink.download = '';
      nameLink.title = item.name;
      var meta = el('div', 'card-meta');
      meta.appendChild(el('span', 'badge', item.badge || label));
      if (item.sizeText) {
        meta.appendChild(el('span', 'dot'));
        meta.appendChild(el('span', null, item.sizeText));
      }
      if (item.dateText) {
        meta.appendChild(el('span', 'dot'));
        meta.appendChild(el('span', null, item.dateText));
      }
      body.appendChild(nameLink);
      body.appendChild(meta);

      var actions = el('div', 'card-actions');
      var download = el('a', 'icon-btn');
      download.href = item.href;
      download.download = '';
      download.title = '下载 ' + item.name;
      download.setAttribute('aria-label', '下载 ' + item.name);
      setHtml(download, svg(ICONS.download));
      actions.appendChild(download);

      head.appendChild(toggle);
      head.appendChild(body);
      head.appendChild(actions);

      var seek = el('input', 'seek');
      seek.type = 'range';
      seek.min = '0';
      seek.max = '1000';
      seek.value = '0';
      seek.disabled = true;
      seek.setAttribute('aria-label', item.name + ' 播放进度');
      ui.seek = seek;

      var time = el('div', 'track-time');
      var now = el('span', 'now', '0:00');
      var spacer = el('span', 'spacer');
      var dur = el('span', 'dur', '--:--');
      time.appendChild(now);
      time.appendChild(spacer);
      time.appendChild(dur);
      ui.now = now;
      ui.dur = dur;
      ui.time = time;

      card.appendChild(head);
      card.appendChild(seek);
      card.appendChild(time);
      li.appendChild(card);
      ui.root = li;

      /* --- wiring ------------------------------------------------------- */

      toggle.addEventListener('click', function () {
        if (audio.paused) play();
        else halt();
      });

      // A single click on the name previews instead of navigating; the
      // dedicated download button is the way to save the file.
      nameLink.addEventListener('click', function (e) {
        e.preventDefault();
        if (audio.paused) play();
        else halt();
      });

      function beginSeek() { seeking = true; }
      function endSeek() {
        var total = effectiveDuration();
        if (total > 0) {
          audio.currentTime = (Number(seek.value) / 1000) * total;
        }
        seeking = false;
        paint();
      }
      seek.addEventListener('pointerdown', beginSeek);
      seek.addEventListener('pointerup', endSeek);
      seek.addEventListener('keydown', beginSeek);
      seek.addEventListener('keyup', endSeek);
      seek.addEventListener('input', function () {
        seeking = true;
        var total = effectiveDuration();
        var ratio = Number(seek.value) / 1000;
        seek.style.setProperty('--p', (ratio * 100).toFixed(2) + '%');
        if (ui.now) ui.now.textContent = formatTime(ratio * total);
      });
      seek.addEventListener('change', endSeek);

      audio.addEventListener('loadedmetadata', function () {
        // <audio> often reports Infinity for VBR MP3, which is why the header
        // probe above takes precedence over audio.duration.
        mediaKnown = true;
        paint();
      });
      audio.addEventListener('play', function () {
        setPlaying(true);
        startTick();
        loadDuration();
        if ('mediaSession' in navigator && typeof MediaMetadata === 'function') {
          try {
            navigator.mediaSession.metadata = new MediaMetadata({
              title: item.name,
              artist: '一些文件'
            });
          } catch (e) { /* ignore */ }
        }
      });
      audio.addEventListener('pause', function () {
        setPlaying(false);
        stopTick();
        paint();
      });
      audio.addEventListener('ended', function () {
        setPlaying(false);
        stopTick();
        paint();
        release();
      });
      audio.addEventListener('timeupdate', paint);
      audio.addEventListener('error', function () {
        setPlaying(false);
        stopTick();
        release();
        if (ui.dur) ui.dur.textContent = '无法播放';
      });

      return ui.root;
    }

    var controls = {
      play: play,
      pause: pause,
      toggle: function () {
        if (audio.paused) play();
        else halt();
      },
      seekTo: function (ratio) {
        var total = effectiveDuration();
        if (total > 0) audio.currentTime = ratio * total;
      },
      stop: stop,
      destroy: function () {
        if (abort) abort.abort();
        stopTick();
        release();
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        if (ui.root && ui.root.parentNode) {
          ui.root.parentNode.removeChild(ui.root);
        }
      }
    };

    var player = {
      audio: audio,
      item: item,
      ui: ui,
      controls: controls,
      build: buildCard,
      /* halt: silent stop when another track takes over.
         pause: stop and release the now-playing bar. */
      halt: halt,
      pause: pause
    };

    return player;
  }

  /* --- State ------------------------------------------------------------ */

  var config = null;
  var items = [];
  var state = { query: '', sort: 'default', desc: false };
  var cardCache = null;   // href -> player, built once per init
  var audioEnabled = false;

  /* --- Rendering -------------------------------------------------------- */

  function plainCard(item) {
    var kind = kindOf(item);
    var label = KIND_LABEL[kind] || '文件';

    var li = el('li');
    var a = el('a', 'card');
    a.href = item.href;
    a.setAttribute('data-kind', kind);

    if (item.dir) {
      a.setAttribute('data-dir', 'true');
    } else if (!item.external) {
      // Cross-origin links ignore the download attribute, so only set it
      // for files served from this site.
      a.setAttribute('download', '');
    }
    a.title = item.name + (item.dir ? '/' : '') + ' — ' + label;
    setHtml(a, iconMarkup(kind));

    var body = el('div', 'card-body');
    body.appendChild(el('span', 'card-name', item.name + (item.dir ? '/' : '')));

    var meta = el('div', 'card-meta');
    meta.appendChild(el('span', 'badge', item.badge || label));
    if (item.sizeText) {
      meta.appendChild(el('span', 'dot'));
      meta.appendChild(el('span', null, item.sizeText));
    }
    if (item.dateText) {
      meta.appendChild(el('span', 'dot'));
      meta.appendChild(el('span', null, item.dateText));
    }
    body.appendChild(meta);
    a.appendChild(body);

    var arrow = el('span', 'card-arrow');
    setHtml(arrow, svg(ICONS.arrow));
    a.appendChild(arrow);

    li.appendChild(a);
    return li;
  }

  function cardFor(item) {
    var playable = audioEnabled && !item.dir && !item.external &&
      kindOf(item) === 'audio';
    if (!playable) return plainCard(item);
    if (cardCache[item.href]) return cardCache[item.href].ui.root;
    var player = createPlayer(item);
    cardCache[item.href] = player;
    return player.build();
  }

  function visibleItems() {
    var q = state.query.trim().toLowerCase();
    var list = q
      ? items.filter(function (it) {
          return it.name.toLowerCase().indexOf(q) !== -1;
        })
      : items.slice();

    if (state.sort === 'default') return list;

    var dir = state.desc ? -1 : 1;
    var key = state.sort;

    return list.sort(function (a, b) {
      // Keep directories grouped above files when sorting by size/date,
      // since they have no meaningful size or timestamp.
      if (key === 'size' || key === 'date') {
        if (a.dir !== b.dir) return a.dir ? -1 : 1;
      }
      var va, vb;
      if (key === 'name') {
        va = a.name.toLowerCase();
        vb = b.name.toLowerCase();
      } else if (key === 'size') {
        va = a.size || 0;
        vb = b.size || 0;
      } else {
        va = a.mtime || 0;
        vb = b.mtime || 0;
      }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }

  function render() {
    var grid = document.getElementById('grid');
    var empty = document.getElementById('empty');
    var count = document.getElementById('count');
    var list = visibleItems();

    grid.textContent = '';
    var frag = document.createDocumentFragment();
    list.forEach(function (item) {
      frag.appendChild(cardFor(item));
    });
    grid.appendChild(frag);

    var total = items.length;
    var shown = list.length;
    if (count) {
      count.textContent = state.query.trim()
        ? shown + ' / ' + total + ' 项'
        : total + ' 项';
    }

    if (empty) {
      var q = state.query.trim();
      var strong = empty.querySelector('[data-query]');
      if (strong) strong.textContent = q;
      empty.classList.toggle('is-visible', shown === 0);
    }

    grid.style.display = shown === 0 ? 'none' : '';

    // Anything that scrolled out of the grid must not keep playing.
    Object.keys(cardCache).forEach(function (href) {
      var player = cardCache[href];
      if (!player.ui.root.parentNode && !player.audio.paused) {
        player.halt();
      }
    });
  }

  /* --- Sorting controls -------------------------------------------------- */

  function setSort(key) {
    if (key === 'default') {
      state.sort = 'default';
      state.desc = false;
    } else if (state.sort === key) {
      state.desc = !state.desc;
    } else {
      state.sort = key;
      state.desc = false;
    }
    syncSortButtons();
    render();
    savePrefs();
  }

  function syncSortButtons() {
    var buttons = document.querySelectorAll('[data-sort]');
    Array.prototype.forEach.call(buttons, function (btn) {
      var key = btn.getAttribute('data-sort');
      var active = state.sort === key;
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      if (active && key !== 'default') {
        btn.setAttribute('data-desc', state.desc ? 'true' : 'false');
      } else {
        btn.removeAttribute('data-desc');
      }
    });
  }

  /* --- Preference persistence ------------------------------------------- */

  var PREF_KEY = 'files.prefs.v1';

  function loadPrefs() {
    try {
      var saved = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
      if (saved && saved.sort) {
        state.sort = saved.sort;
        state.desc = !!saved.desc;
      }
    } catch (e) { /* storage unavailable — keep defaults */ }
  }

  function savePrefs() {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({
        sort: state.sort,
        desc: state.desc
      }));
    } catch (e) { /* ignore */ }
  }

  /* --- Wiring ------------------------------------------------------------ */

  function wire() {
    var input = document.getElementById('search');
    if (input) {
      var wrap = input.closest('.search');
      var update = function () {
        state.query = input.value;
        if (wrap) wrap.classList.toggle('has-value', input.value.length > 0);
        render();
      };
      input.addEventListener('input', update);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          input.value = '';
          update();
          input.blur();
        }
      });

      var clear = document.querySelector('.search .clear');
      if (clear) {
        clear.addEventListener('click', function () {
          input.value = '';
          update();
          input.focus();
        });
      }

      // "/" focuses the search box, like most file browsers.
      document.addEventListener('keydown', function (e) {
        if (e.key === '/' && document.activeElement !== input &&
            !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
          e.preventDefault();
          input.focus();
          input.select();
        }
      });
    }

    var buttons = document.querySelectorAll('[data-sort]');
    Array.prototype.forEach.call(buttons, function (btn) {
      btn.addEventListener('click', function () {
        setSort(btn.getAttribute('data-sort'));
      });
    });

    syncSortButtons();
  }

  /* --- Public API -------------------------------------------------------- */

  function normalize(raw, base) {
    return raw.map(function (item) {
      var href = item.href != null ? item.href : encodePath(item.name);
      var external = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href);
      if (item.dir && !external && href.charAt(href.length - 1) !== '/') href += '/';
      return {
        name: item.name,
        href: external ? href : base + href,
        dir: !!item.dir,
        external: external,
        size: item.size || 0,
        mtime: item.mtime || 0,
        kind: item.kind || '',
        badge: item.badge || '',
        media: item.audio,
        sizeText: item.dir ? '' : formatSize(item.size),
        dateText: formatDate(item.mtime)
      };
    });
  }

  window.DirectoryListing = {
    init: function (options) {
      config = options || {};
      var base = config.base != null ? config.base : '';
      audioEnabled = !!config.audio;
      items = normalize(config.items || [], base);
      cardCache = {};

      if (config.title) {
        document.title = config.title;
        var titleEl = document.getElementById('page-title');
        if (titleEl && !titleEl.textContent.trim()) {
          titleEl.textContent = config.title;
        }
      }

      loadPrefs();
      wire();
      render();
    },
    /* Exposed for tests and for pages that append items later. */
    formatSize: formatSize,
    formatDate: formatDate,
    formatTime: formatTime,
    kindOf: kindOf,
    probeDuration: probeDuration,
    parseMediaHeader: parseMediaHeader
  };
})();
