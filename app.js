// Tours por Madrid — la Baraja.
// Dos modos: con window.TOURS_CONFIG (GitHub Pages) habla con Supabase por sus funciones RPC (db/esquema.sql);
// sin él (artifact de claude.ai, que no deja llamar a otras webs) es un prototipo con miembros de ejemplo.
(function () {
  'use strict';
  var T = window.TEMATICAS, EJ = window.EJEMPLO, CONSEJOS = window.CONSEJOS;
  var CFG = window.TOURS_CONFIG || null, ONLINE = !!(CFG && CFG.url && CFG.key);
  var KEY = ONLINE ? 'toursmadrid-online-v1' : 'toursmadrid-v1', PASO = 280, ANCHO = 270, UMBRAL = 90;
  var CORAZON = 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z';
  var EQUIS = 'M6 6l12 12M18 6L6 18';
  var EXTERNO = 'M14 4h6v6M20 4l-9 9M18 14v5H5V6h5';
  var MSG = {
    pin_incorrecto: 'Ese nombre ya existe y el PIN no coincide. Si no eres tú, elige otro nombre.',
    bloqueado: 'Demasiados intentos con ese nombre. Espera 15 minutos.',
    nombre_no_valido: 'El nombre tiene que tener entre 2 y 20 letras.',
    pin_no_valido: 'El PIN son 4 cifras, solo números.',
    fecha_repetida: 'Esa fecha y franja ya están propuestas: márcala en la lista.',
    fecha_pasada: 'Ese día ya ha pasado. Elige uno a partir de hoy.'
  };

  function $(s) { return document.querySelector(s); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ini(n) { return (n || '?').trim().charAt(0).toUpperCase(); }
  function svg(d, cls, w) { return '<svg viewBox="0 0 24 24" width="' + (w || 20) + '" height="' + (w || 20) + '" aria-hidden="true" class="' + (cls || 'ic') + '"><path d="' + d + '"></path></svg>'; }

  // ---------- estado propio (S) y del grupo (G) ----------
  function nuevo() { return { me: null, tours: [], paso: [], temas: [], fechas: [], vienen: [], tema: 'noche', pos: {} }; }
  function cargar() {
    try { var j = JSON.parse(localStorage.getItem(KEY)); if (j && typeof j === 'object') return Object.assign(nuevo(), j); } catch (e) {}
    return nuevo();
  }
  function guardar() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function quitar(a, id) { var k = a.indexOf(id); if (k >= 0) a.splice(k, 1); }
  function poner(a, id) { if (a.indexOf(id) < 0) a.push(id); }
  var S = cargar();
  if (!T.some(function (c) { return c.id === S.tema; })) S.tema = T[0].id;
  var TOUR = {};
  T.forEach(function (c) { c.tours.forEach(function (t) { TOUR[t.id] = { t: t, cat: c }; }); });

  function grupoEjemplo() {
    var g = { miembros: EJ.miembros.map(function (m) { return m.nick; }), tema: {}, si: {}, no: {}, fechas: EJ.fechas.map(function (f) { return Object.assign({}, f); }) };
    g.miembros.forEach(function (n) {
      (EJ.votosTematica[n] || []).forEach(function (t) { (g.tema[t] = g.tema[t] || []).push(n); });
      (EJ.votosTour[n] || []).forEach(function (t) { (g.si[t] = g.si[t] || []).push(n); });
    });
    return g;
  }
  var G = ONLINE ? { miembros: [], tema: {}, si: {}, no: {}, fechas: [] } : grupoEjemplo();

  function yo() { return S.me ? S.me.nick : 'Tú'; }
  function esYo(n) { return !!S.me && String(n).toLowerCase() === S.me.nick.toLowerCase(); }
  function otros(a) { return (a || []).filter(function (n) { return !esYo(n); }); }
  function quienesTour(id) { var a = otros(G.si[id]); if (S.tours.indexOf(id) >= 0) a.unshift(yo()); return a; }
  function quienesTema(id) { var a = otros(G.tema[id]); if (S.temas.indexOf(id) >= 0) a.unshift(yo()); return a; }
  function miembros() { return [yo()].concat(otros(G.miembros)); }
  function todasFechas() {
    return G.fechas.concat(S.fechas).map(function (f) {
      var v = otros(f.vienen);
      if (S.vienen.indexOf(f.id) >= 0) v.unshift(yo());
      return { id: f.id, dia: f.dia, franja: f.franja, nota: f.nota || '', por: f.por, vienen: v };
    }).sort(function (a, b) { return a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0; });
  }

  // ---------- Supabase (solo en línea) ----------
  function rpc(fn, args) {
    return fetch(CFG.url + '/rest/v1/rpc/' + fn, {
      method: 'POST', headers: { apikey: CFG.key, 'Content-Type': 'application/json' }, body: JSON.stringify(args || {})
    }).then(function (r) {
      return r.text().then(function (t) {
        var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
        if (!r.ok) throw new Error((j && j.message) || ('HTTP ' + r.status));
        return j;
      });
    });
  }
  function token() { return S.me && S.me.token; }
  function fallo(e) {
    var m = String((e && e.message) || e);
    if (/sesion_no_valida/.test(m)) { S = nuevo(); guardar(); pintarTodo(); mostrarEntrada(); aviso('Vuelve a entrar con tu nombre y tu PIN.'); return; }
    var k = Object.keys(MSG).filter(function (x) { return m.indexOf(x) >= 0; })[0];
    aviso(k ? MSG[k] : 'No se ha podido guardar. Revisa la conexión.');
    refrescar();
  }
  function refrescar() {
    if (!ONLINE) return Promise.resolve();
    return rpc('estado').then(function (j) {
      var g = { miembros: j.miembros || [], tema: {}, si: {}, no: {}, fechas: j.fechas || [] };
      (j.votos_tema || []).forEach(function (v) { (g.tema[v.tema] = g.tema[v.tema] || []).push(v.nick); });
      (j.votos_tour || []).forEach(function (v) { var m = v.valor > 0 ? g.si : g.no; (m[v.tour] = m[v.tour] || []).push(v.nick); });
      G = g;
      if (S.me) {
        var mios = function (m) { return Object.keys(m).filter(function (k) { return m[k].some(esYo); }); };
        S.temas = mios(g.tema); S.tours = mios(g.si); S.paso = mios(g.no); S.fechas = [];
        S.vienen = g.fechas.filter(function (f) { return (f.vienen || []).some(esYo); }).map(function (f) { return f.id; });
        guardar();
      }
      repintar();
    }).catch(function () {});
  }
  function repintar() {
    if (ocupado || document.querySelector('.arrastrando')) return;
    pintarPerfil();
    if (vista === 'tours') { pintarCarrusel(); pintarBaraja(false); }
    if (vista === 'fechas') pintarFechas();
    if (vista === 'plan') pintarPlan();
  }
  function mejorFecha(fs) {
    var m = null;
    fs.forEach(function (f) { if (f.vienen.length && (!m || f.vienen.length > m.vienen.length)) m = f; });
    return m;
  }
  function nombres(a) {
    if (!a.length) return 'Nadie todavía';
    var b = a.map(function (n) { return n === yo() ? 'Tú' : n; });
    return b.length < 2 ? b[0] : b.slice(0, -1).join(', ') + ' y ' + b[b.length - 1];
  }
  function avs(a, max) {
    return '<span class="avs">' + a.slice(0, max || 4).map(function (n) {
      return '<span class="av' + (n === yo() ? ' yo' : '') + '">' + esc(ini(n)) + '</span>';
    }).join('') + '</span>';
  }
  function fechaPartes(dia) {
    var d = new Date(dia + 'T12:00:00');
    return {
      dow: d.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', ''),
      num: d.getDate(),
      mes: d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', ''),
      largo: d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })
    };
  }
  function hoyISO() { var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }

  var toastT;
  function aviso(txt) {
    var t = $('#toast'); t.textContent = txt; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, 1800);
  }

  // ---------- perfil y entrada ----------
  function pintarPerfil() {
    $('#perfil-av').textContent = S.me ? ini(S.me.nick) : '?';
    $('#perfil-nick').textContent = S.me ? S.me.nick : 'Entrar';
  }
  // PIN: teclado numérico directo (type=text + inputmode); si el navegador no sabe tapar el texto, vuelve a password
  if (!(window.CSS && (CSS.supports('-webkit-text-security', 'disc') || CSS.supports('text-security', 'disc')))) $('#pin').type = 'password';
  $('#pin').addEventListener('input', function () { var v = this.value.replace(/\D/g, '').slice(0, 4); if (v !== this.value) this.value = v; });
  function mayus(t) { return t.charAt(0).toLocaleUpperCase('es') + t.slice(1); }
  $('#nick').addEventListener('input', function () {
    var v = this.value, m = mayus(v);
    if (m !== v) { var a = this.selectionStart, b = this.selectionEnd; this.value = m; try { this.setSelectionRange(a, b); } catch (e) {} }
  });
  $('#nick').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('#pin').focus(); } });
  function mostrarEntrada() { $('#entrada').hidden = false; setTimeout(function () { try { $('#nick').focus(); } catch (e) {} }, 50); }
  $('#f-entrada').addEventListener('submit', function (e) {
    e.preventDefault();
    var nick = mayus($('#nick').value.trim()), pin = $('#pin').value.trim(), err = $('#error-entrada');
    if (nick.length < 2) { err.textContent = 'Tu nombre tiene que tener al menos 2 letras.'; return; }
    if (!/^\d{4}$/.test(pin)) { err.textContent = 'El PIN son 4 cifras, solo números.'; return; }
    if (ONLINE) {
      err.textContent = '';
      var boton = $('#f-entrada button[type=submit]'); boton.disabled = true;
      rpc('entrar', { p_nick: nick, p_pin: pin }).then(function (j) {
        boton.disabled = false;
        if (!j || j.error) { err.textContent = MSG[j && j.error] || 'No se ha podido entrar.'; return; }
        S = nuevo(); S.me = { nick: j.nick, token: j.token }; guardar();
        $('#entrada').hidden = true; pintarTodo(); refrescar();
        aviso(j.nuevo ? '¡Bienvenido, ' + j.nick + '!' : '¡Hola de nuevo, ' + j.nick + '!');
      }).catch(function () { boton.disabled = false; err.textContent = 'No hay conexión. Prueba otra vez.'; });
      return;
    }
    var usado = EJ.miembros.some(function (m) { return m.nick.toLowerCase() === nick.toLowerCase(); });
    if (usado) { err.textContent = 'Ese nombre ya lo usa alguien del grupo. Si eres tú, pon tu PIN; si no, elige otro.'; return; }
    err.textContent = '';
    S.me = { nick: nick };
    guardar();
    $('#entrada').hidden = true;
    pintarTodo();
    aviso('¡Hola, ' + nick + '!');
  });
  $('#perfil').addEventListener('click', function () {
    if (!S.me) { mostrarEntrada(); return; }
    abrirHoja('<span class="asa"></span>' +
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px"><span class="av yo" style="width:48px;height:48px;border-radius:24px;font-size:20px">' + esc(ini(S.me.nick)) + '</span>' +
      '<div><div class="grande">' + esc(S.me.nick) + '</div><div class="por">Te apetecen ' + S.tours.length + ' tours y ' + S.temas.length + ' temáticas</div></div></div>' +
      '<p class="sub" style="margin:0 0 16px">Con tu nombre y tu PIN puedes entrar desde otro móvil y seguir donde lo dejaste.</p>' +
      '<div class="fila-bot"><button class="bot claro" data-cerrar>Cerrar</button><button class="bot" id="salir">Cambiar de usuario</button></div>');
    $('#salir').addEventListener('click', function () {
      S = nuevo(); guardar(); cerrarHoja(); pintarTodo(); mostrarEntrada();
    });
  });

  // ---------- feedback: no se guarda en ningún sitio; sale la pantalla de «será el próximo en ser atendido» ----------
  function abrirOpinar() { $('#modal-opinar').hidden = false; $('#velo').classList.add('on'); var v = $('#modal-opinar video'); try { v.currentTime = 0; v.play(); } catch (e) {} setTimeout(function () { try { $('#opinion').focus(); } catch (e) {} }, 300); }
  function cerrarOpinar() { $('#modal-opinar').hidden = true; if (!$('#hoja').classList.contains('on')) $('#velo').classList.remove('on'); }
  $('#opinar').addEventListener('click', abrirOpinar);
  $('#cerrar-opinar').addEventListener('click', cerrarOpinar);
  var esperaT;
  $('#f-opinar').addEventListener('submit', function (e) {
    e.preventDefault();
    if ($('#opinion').value.trim().length < 3) { $('#error-opinar').textContent = 'Escribe algo, aunque sea corto.'; return; }
    $('#opinion').value = ''; $('#error-opinar').textContent = '';
    cerrarOpinar();
    $('#espera').hidden = false; $('#colgar').hidden = true;
    clearTimeout(esperaT); esperaT = setTimeout(function () { $('#colgar').hidden = false; }, 5000);
  });
  $('#colgar').addEventListener('click', function () { $('#espera').hidden = true; });

  // ---------- hoja ----------
  function abrirHoja(html) {
    var h = $('#hoja'); h.innerHTML = html; h.classList.add('on'); $('#velo').classList.add('on');
    h.querySelectorAll('[data-cerrar]').forEach(function (b) { b.addEventListener('click', cerrarHoja); });
  }
  function cerrarHoja() { $('#hoja').classList.remove('on'); $('#velo').classList.remove('on'); }
  $('#velo').addEventListener('click', function () { cerrarHoja(); cerrarOpinar(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { cerrarHoja(); cerrarOpinar(); } });

  // ---------- vistas ----------
  var vista = 'tours';
  document.querySelectorAll('.dock button').forEach(function (b) {
    b.addEventListener('click', function () { irA(b.getAttribute('data-vista')); });
  });
  function irA(v) {
    vista = v;
    document.querySelectorAll('.dock button').forEach(function (b) {
      if (b.getAttribute('data-vista') === v) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    ['tours', 'fechas', 'plan'].forEach(function (k) { $('#v-' + k).hidden = k !== v; });
    $('#v-' + v).scrollTop = 0;
    refrescar();
    if (v === 'fechas') pintarFechas();
    if (v === 'plan') pintarPlan();
    if (v === 'tours') { pintarCarrusel(); pintarBaraja(false); }
  }

  // ---------- carrusel de temáticas (da vueltas: tras la última viene la primera) ----------
  function ti() { for (var i = 0; i < T.length; i++) if (T[i].id === S.tema) return i; return 0; }
  function margen() { return ($('#car-vent').clientWidth - ANCHO) / 2; }
  // distancia circular de la tarjeta i a la activa a: -3..3 con 7 temáticas
  function rel(i, a) { var n = T.length, k = ((i - a) % n + n) % n; return k > n / 2 ? k - n : k; }
  function pintarCarrusel() {
    $('#pista').innerHTML = T.map(function (c, i) {
      var on = S.temas.indexOf(c.id) >= 0;
      return '<div class="tema' + (on ? ' votada' : '') + '" data-i="' + i + '">' +
        '<div class="tema-cab"><span class="tema-ic">' + svg(c.d) + '</span><span class="tema-nom">' + esc(c.nombre) + '</span></div>' +
        '<div class="tema-pie"><span class="tema-n">' + c.tours.length + (c.tours.length === 1 ? ' tour' : ' tours') + ' · <b>' + quienesTema(c.id).length + '</b> votos</span>' +
        '<button class="megusta' + (on ? ' on' : '') + '" data-tema="' + c.id + '" aria-pressed="' + on + '" aria-label="Me apetece la temática ' + esc(c.nombre) + '">' + svg(CORAZON, 'icf', 16) + '<span>' + (on ? 'Te apetece' : 'Me apetece') + '</span></button></div>' +
        '<button class="tema-tapa" data-ir="' + i + '" aria-label="Ver ' + esc(c.nombre) + '"></button></div>';
    }).join('');
    $('#puntos').innerHTML = T.map(function (c, i) {
      return '<button class="punto" data-ir="' + i + '" aria-label="' + esc(c.nombre) + '"></button>';
    }).join('');
    colocar(false);
  }
  function colocar(anim, dx) {
    var a = ti(), m = margen(), els = document.querySelectorAll('.tema');
    els.forEach(function (el, i) {
      var k = rel(i, a), antes = el._k;
      // la que da la vuelta (pasa de un extremo al otro) salta sin cruzar la pantalla
      if (anim === false || dx !== undefined || (antes !== undefined && Math.abs(k - antes) > 1)) el.classList.add('salta');
      el.style.transform = 'translateX(' + (m + k * PASO + (dx || 0)) + 'px) scale(' + (k === 0 ? 1 : 0.92) + ')';
      el.classList.toggle('activa', k === 0);
      if (dx === undefined) el._k = k;
    });
    if (dx === undefined) requestAnimationFrame(function () { requestAnimationFrame(function () { els.forEach(function (el) { el.classList.remove('salta'); }); }); });
    document.querySelectorAll('.punto').forEach(function (el, k) { el.classList.toggle('on', k === a); });
  }
  function irTema(i) {
    var n = T.length;
    S.tema = T[((i % n) + n) % n].id; guardar(); colocar(true); pintarBaraja(true);
  }
  $('#ant').addEventListener('click', function () { irTema(ti() - 1); });
  $('#sig').addEventListener('click', function () { irTema(ti() + 1); });
  $('#puntos').addEventListener('click', function (e) { var b = e.target.closest('[data-ir]'); if (b) irTema(+b.getAttribute('data-ir')); });
  var arrastroTema = false;
  $('#pista').addEventListener('click', function (e) {
    if (arrastroTema) return;
    var v = e.target.closest('[data-tema]');
    if (v) {
      // Se cambia en su sitio (sin repintar) para que se vea la animación del color
      var id = v.getAttribute('data-tema'), on = S.temas.indexOf(id) < 0, tarjeta = v.closest('.tema');
      if (on) poner(S.temas, id); else quitar(S.temas, id);
      guardar();
      tarjeta.classList.toggle('votada', on);
      v.classList.toggle('on', on);
      v.setAttribute('aria-pressed', on);
      v.querySelector('span').textContent = on ? 'Te apetece' : 'Me apetece';
      tarjeta.querySelector('.tema-n b').textContent = quienesTema(id).length;
      if (ONLINE) rpc('votar_tema', { p_token: token(), p_tema: id, p_on: on }).catch(fallo);
      return;
    }
    var t = e.target.closest('[data-ir]');
    if (t) irTema(+t.getAttribute('data-ir'));
  });
  (function () {
    var vent = $('#car-vent'), x0 = 0, dx = 0, abajo = false, movido = false, id = null;
    vent.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.flecha')) return;
      abajo = true; movido = false; x0 = e.clientX; dx = 0; id = e.pointerId; arrastroTema = false;
    });
    vent.addEventListener('pointermove', function (e) {
      if (!abajo) return;
      dx = e.clientX - x0;
      if (!movido && Math.abs(dx) > 8) { movido = true; arrastroTema = true; try { vent.setPointerCapture(id); } catch (x) {} vent.classList.remove('amago'); }
      if (movido) colocar(true, dx);
    });
    function fin() {
      if (!abajo) return; abajo = false;
      if (movido) {
        document.querySelectorAll('.tema').forEach(function (el) { el.classList.remove('salta'); });
        if (dx < -60) irTema(ti() + 1);
        else if (dx > 60) irTema(ti() - 1);
        else colocar(true);
        setTimeout(function () { arrastroTema = false; }, 0);
      }
    }
    vent.addEventListener('pointerup', fin);
    vent.addEventListener('pointercancel', fin);
    window.addEventListener('resize', function () { colocar(false); });
  })();

  // ---------- baraja ----------
  // Deslizar solo navega entre tours (izquierda = siguiente, derecha = anterior).
  // Se vota con los botones de dentro de la tarjeta: cae el sello y pasa al siguiente.
  var ESTRELLA = 'M0 -12L3.5 -4 12 -3.7 5.4 2 7.4 10.5 0 5.8 -7.4 10.5 -5.4 2 -12 -3.7 -3.5 -4Z';
  function estampa(tipo, puesta) {
    var abajo = tipo === 'si' ? 'VISTO BUENO' : 'NI DE BROMA';
    return '<div class="estampa ' + tipo + (puesta ? ' puesta' : '') + '" aria-hidden="true"><svg viewBox="-40 0 380 300"><g filter="url(#tinta-carta)">' +
      '<circle cx="150" cy="150" r="140" fill="none" stroke="currentColor" stroke-width="8"></circle>' +
      '<circle cx="150" cy="150" r="128" fill="none" stroke="currentColor" stroke-width="3"></circle>' +
      '<circle cx="150" cy="150" r="86" fill="none" stroke="currentColor" stroke-width="4"></circle>' +
      '<text font-size="25" letter-spacing="3" fill="currentColor"><textPath href="#arco-sup" startOffset="50%" text-anchor="middle">TOURS POR MADRID</textPath></text>' +
      '<text font-size="25" letter-spacing="3" fill="currentColor"><textPath href="#arco-inf" startOffset="50%" text-anchor="middle">' + abajo + '</textPath></text>' +
      '<path fill="currentColor" transform="translate(150 97)" d="' + ESTRELLA + '"></path>' +
      '<path fill="currentColor" transform="translate(150 203)" d="' + ESTRELLA + '"></path>' +
      '<rect x="-30" y="112" width="360" height="76" fill="currentColor" mask="url(#ko-' + tipo + ')"></rect></g></svg></div>';
  }
  var RELOJ = 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 7v5l3 2';
  var GLOBO = 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18';
  var PIN = 'M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11zM12 8a2 2 0 1 0 0 4a2 2 0 1 0 0-4z';
  // «2 h 15 min · Plaza Mayor · ES, EN» → etiquetas con su icono
  function datos(meta) {
    return meta.split(' · ').map(function (m) {
      var ic = /\d ?h\b|min|Horario/.test(m) ? RELOJ : /^(ES|EN|DE|FR|IT|PT)(,|$)/.test(m) ? GLOBO : /^(Plaza|Metro|Callao|Sol)/.test(m) ? PIN : null;
      return '<span class="dato">' + (ic ? svg(ic, 'ic', 13) : '') + esc(m) + '</span>';
    }).join('');
  }
  function cartaHTML(t, d, n, total) {
    var mio = S.tours.indexOf(t.id) >= 0, paso = S.paso.indexOf(t.id) >= 0, q = quienesTour(t.id);
    var tf = d === 0 ? 'none' : d === 1 ? 'translateY(14px) scale(.95)' : 'translateY(28px) scale(.9)';
    return '<article class="carta" data-d="' + d + '" style="z-index:' + (3 - d) + ';transform:' + tf + '" aria-label="' + esc(t.t) + '">' +
      '<div class="cabeza"><div class="foto"><img src="img/' + t.id + '.jpg" alt="" draggable="false" style="object-position:50% ' + (t.foco || 50) + '%" onerror="this.remove()">' +
      estampa('si', mio) + estampa('no', paso) + '</div>' +
      '<div class="votar"><button class="v-no" data-voto="-1" aria-pressed="' + paso + '" aria-label="Bufff, este no">' + svg(EQUIS, 'ic', 22) + '</button>' +
      '<button class="v-si" data-voto="1" aria-pressed="' + mio + '" aria-label="Me apetece">' + svg(CORAZON, 'icf', 26) + '</button></div></div>' +
      '<div class="cuerpo"><div class="ceja-t">Tour ' + n + ' / ' + total + '</div>' +
      '<h2>' + esc(t.t) + '</h2>' +
      '<div class="datos"><span class="dato dur">' + svg(RELOJ, 'ic', 13) + esc(t.dur) + '</span><span class="dato">' + esc(t.valor) + '</span><span class="dato precio' + (t.precio === 'Propina libre' ? '' : ' pago') + '">' + esc(t.precio) + '</span></div>' +
      '<p class="breve">' + esc(t.breve || t.desc) + '</p>' +
      '<div class="pie"><div class="quien">' + avs(q) + '<span>' + esc(nombres(q)) + '</span></div>' +
      '<a class="info" href="' + esc(t.u) + '" target="_blank" rel="noopener">Toda la info en ' + esc(t.web) + svg(EXTERNO, 'ic', 14) + '</a></div></div></article>';
  }
  function pintarBaraja(anim) {
    var c = T[ti()], tours = c.tours, i = Math.min(S.pos[c.id] || 0, tours.length), z = $('#baraja');
    var mias = tours.filter(function (t) { return S.tours.indexOf(t.id) >= 0; }).length;
    var vistos = tours.filter(function (t) { return S.tours.indexOf(t.id) >= 0 || S.paso.indexOf(t.id) >= 0; }).length;
    $('#progreso').textContent = 'Desliza · votados ' + vistos + '/' + tours.length + ' · ♥ ' + mias;
    if (i >= tours.length) {
      var nPaso = tours.filter(function (t) { return S.paso.indexOf(t.id) >= 0; }).length, sigT = T[(ti() + 1) % T.length];
      z.innerHTML = '<div class="fin"><div class="fin-cab"><span class="tema-ic">' + svg(c.d) + '</span><div><span class="fin-ceja">Temática repasada</span><strong>' + esc(c.nombre) + '</strong></div>' +
        '<span class="fin-cuenta">♥ ' + mias + ' · ✕ ' + nPaso + '</span></div><ul class="fin-lista">' + tours.map(function (t, k) {
          var v = S.tours.indexOf(t.id) >= 0 ? 'si' : S.paso.indexOf(t.id) >= 0 ? 'no' : 'nada';
          return '<li><button data-ir-tour="' + k + '"><img src="img/' + t.id + '.jpg" alt="" style="object-position:50% ' + (t.foco || 50) + '%"><span>' + esc(t.t) + '</span>' +
            '<span class="marca ' + v + '">' + (v === 'si' ? svg(CORAZON, 'icf', 14) : v === 'no' ? svg(EQUIS, 'ic', 14) : '—') + '</span></button></li>';
        }).join('') + '</ul><div class="fin-bot"><button class="bot claro" id="repasar">Repasar</button><button class="bot" id="otra-tema">' + esc(sigT.nombre) + ' ›</button></div></div>';
      $('#repasar').addEventListener('click', function () { S.pos[c.id] = 0; guardar(); pintarBaraja('vuelve'); });
      $('#otra-tema').addEventListener('click', function () { irTema(ti() + 1); });
      z.querySelectorAll('[data-ir-tour]').forEach(function (b) { b.addEventListener('click', function () { S.pos[c.id] = +b.getAttribute('data-ir-tour'); guardar(); pintarBaraja('vuelve'); }); });
      return;
    }
    var html = '';
    for (var d = 2; d >= 0; d--) { var t = tours[i + d]; if (t) html += cartaHTML(t, d, i + d + 1, tours.length); }
    z.innerHTML = html;
    var top = z.querySelector('.carta[data-d="0"]');
    if (anim) top.classList.add(anim === 'vuelve' ? 'vuelve' : 'nueva');
    arrastre(top);
  }
  var ocupado = false;
  // Mueve la baraja: +1 siguiente (la tarjeta sale por la izquierda), -1 anterior (sale por la derecha)
  function irTour(delta) {
    if (ocupado) return;
    var c = T[ti()], i = S.pos[c.id] || 0, n = i + delta;
    if (n < 0 || n > c.tours.length) return;
    var card = $('#baraja .carta[data-d="0"]');
    S.pos[c.id] = n; guardar();
    if (!card) { pintarBaraja(delta > 0 ? 'nueva' : 'vuelve'); return; }
    ocupado = true;
    card.classList.remove('arrastrando', 'nueva', 'vuelve');
    card.classList.add(delta > 0 ? 'sale-izq' : 'sale-der');
    setTimeout(function () { ocupado = false; pintarBaraja(delta > 0 ? 'nueva' : 'vuelve'); }, 280);
  }
  function arrastre(card) {
    var x0 = 0, dx = 0, abajo = false, movido = false, id = null;
    var segunda = card.parentNode.querySelector('.carta[data-d="1"]');
    card.addEventListener('pointerdown', function (e) {
      if (ocupado) return;
      abajo = true; movido = false; x0 = e.clientX; dx = 0; id = e.pointerId;
    });
    card.addEventListener('pointermove', function (e) {
      if (!abajo) return;
      dx = e.clientX - x0;
      // La captura empieza al moverse: así un toque en los botones o el enlace sigue siendo un clic normal
      if (!movido && Math.abs(dx) > 8) { movido = true; card.classList.add('arrastrando'); card.classList.remove('nueva', 'vuelve'); try { card.setPointerCapture(id); } catch (x) {} }
      if (!movido) return;
      card.style.transform = 'translateX(' + dx + 'px) rotate(' + (dx / 22) + 'deg)';
      if (segunda && dx < 0) { var l = Math.min(1, -dx / 160); segunda.style.transition = 'none'; segunda.style.transform = 'translateY(' + (14 - 14 * l) + 'px) scale(' + (0.95 + 0.05 * l) + ')'; }
    });
    function fin() {
      if (!abajo) return; abajo = false;
      if (!movido) return;
      card.classList.remove('arrastrando');
      var c = T[ti()], i = S.pos[c.id] || 0;
      if (dx < -UMBRAL) irTour(1);
      else if (dx > UMBRAL && i > 0) irTour(-1);
      else {
        card.style.transform = 'none';
        if (segunda) { segunda.style.transition = ''; segunda.style.transform = 'translateY(14px) scale(.95)'; }
      }
      // tras un arrastre no debe colarse el clic en un botón de la tarjeta
      var tapa = function (ev) { ev.stopPropagation(); ev.preventDefault(); };
      card.addEventListener('click', tapa, true);
      setTimeout(function () { card.removeEventListener('click', tapa, true); }, 0);
    }
    card.addEventListener('pointerup', fin);
    card.addEventListener('pointercancel', fin);
  }
  // dir 1 = ME APETECE, -1 = BUFFF: cae el sello, la tarjeta da un golpe y pasa al siguiente
  function votar(dir) {
    if (ocupado) return;
    var c = T[ti()], i = S.pos[c.id] || 0, t = c.tours[i];
    var card = $('#baraja .carta[data-d="0"]');
    if (!t || !card) return;
    ocupado = true;
    if (dir > 0) { poner(S.tours, t.id); quitar(S.paso, t.id); } else { poner(S.paso, t.id); quitar(S.tours, t.id); }
    guardar();
    if (ONLINE) rpc('votar_tour', { p_token: token(), p_tour: t.id, p_valor: dir }).catch(fallo);
    var si = card.querySelector('.estampa.si'), no = card.querySelector('.estampa.no'), sale = dir > 0 ? si : no, otra = dir > 0 ? no : si;
    otra.classList.remove('puesta', 'cae');
    sale.classList.remove('puesta', 'cae'); void sale.offsetWidth; sale.classList.add('cae');
    card.classList.remove('nueva', 'vuelve'); card.classList.add('golpe');
    card.querySelector('.v-si').setAttribute('aria-pressed', dir > 0);
    card.querySelector('.v-no').setAttribute('aria-pressed', dir < 0);
    setTimeout(function () { ocupado = false; irTour(1); }, 650);
  }
  $('#baraja').addEventListener('click', function (e) {
    var b = e.target.closest('[data-voto]');
    if (b) votar(+b.getAttribute('data-voto'));
  });
  document.addEventListener('keydown', function (e) {
    if (vista !== 'tours' || $('#hoja').classList.contains('on') || !$('#entrada').hidden) return;
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight') irTour(1);
    if (e.key === 'ArrowLeft') irTour(-1);
  });

  // ---------- fechas ----------
  var recien = null;
  function pintarFechas() {
    var fs = todasFechas(), m = mejorFecha(fs), L = $('#lista-fechas');
    if (!fs.length) { L.innerHTML = '<p class="sub">Todavía no hay fechas. Propón la primera.</p>'; return; }
    L.innerHTML = fs.map(function (f) {
      var p = fechaPartes(f.dia), on = S.vienen.indexOf(f.id) >= 0, mejor = m && m.id === f.id;
      return '<article class="fecha' + (mejor ? ' mejor' : '') + (recien === f.id ? ' recien' : '') + '">' +
        '<div class="dia"><span class="dow">' + esc(p.dow) + '</span><span class="num">' + p.num + '</span><span class="mes">' + esc(p.mes) + '</span></div>' +
        '<div class="fecha-info"><div class="chips"><span class="chip">' + esc(f.franja) + '</span>' + (mejor ? '<span class="chip rojo">La que más gente puede</span>' : '') + '</div>' +
        (f.nota ? '<p class="nota">' + esc(f.nota) + '</p>' : '') +
        '<div class="quien">' + avs(f.vienen, 5) + '<span>' + (f.vienen.length === 1 ? '1 puede' : f.vienen.length + ' pueden') + '</span></div>' +
        '<div class="por">Propuesta por ' + esc(f.por === yo() ? 'ti' : f.por) + '</div>' +
        '<button class="puedo' + (on ? ' on' : '') + '" data-fecha="' + esc(f.id) + '" aria-pressed="' + on + '">' + (on ? svg('M5 12l5 5L20 7', 'ic', 16) + 'Me viene bien' : '¿Te viene bien?') + '</button></div></article>';
    }).join('');
    recien = null;
  }
  $('#lista-fechas').addEventListener('click', function (e) {
    var b = e.target.closest('[data-fecha]'); if (!b) return;
    var id = b.getAttribute('data-fecha'), on = S.vienen.indexOf(id) < 0;
    if (on) poner(S.vienen, id); else quitar(S.vienen, id);
    guardar(); pintarFechas();
    if (ONLINE) rpc('marcar_fecha', { p_token: token(), p_fecha: id, p_on: on }).then(refrescar).catch(fallo);
  });
  $('#proponer').addEventListener('click', function () {
    var franja = 'Tarde';
    abrirHoja('<span class="asa"></span><h2 class="grande" style="margin-bottom:16px">Proponer una fecha</h2>' +
      '<form id="f-fecha" novalidate>' +
      '<div class="campo"><label for="f-dia">Día</label><input id="f-dia" type="date" min="' + hoyISO() + '"></div>' +
      '<div class="campo"><label>Franja</label><div class="seg" id="f-franja">' +
      ['Mañana', 'Tarde', 'Noche'].map(function (x) { return '<button type="button" aria-pressed="' + (x === franja) + '">' + x + '</button>'; }).join('') + '</div></div>' +
      '<div class="campo"><label for="f-nota">Nota (opcional)</label><input id="f-nota" maxlength="60" placeholder="Por ejemplo, después cañas"></div>' +
      '<p class="error" id="error-fecha" role="alert"></p>' +
      '<div class="fila-bot"><button type="button" class="bot claro" data-cerrar>Cancelar</button><button type="submit" class="bot">Proponer</button></div></form>');
    $('#f-franja').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      franja = b.textContent;
      this.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
    });
    $('#f-fecha').addEventListener('submit', function (e) {
      e.preventDefault();
      var dia = $('#f-dia').value, nota = $('#f-nota').value.trim(), err = $('#error-fecha');
      if (!dia) { err.textContent = 'Elige un día.'; return; }
      if (dia < hoyISO()) { err.textContent = 'Ese día ya ha pasado. Elige uno a partir de hoy.'; return; }
      if (todasFechas().some(function (f) { return f.dia === dia && f.franja === franja; })) { err.textContent = 'Esa fecha y franja ya están propuestas: márcala en la lista.'; return; }
      if (ONLINE) {
        rpc('proponer_fecha', { p_token: token(), p_dia: dia, p_franja: franja, p_nota: nota }).then(function (nid) {
          recien = nid; cerrarHoja(); refrescar(); aviso('Fecha propuesta: ' + fechaPartes(dia).largo);
        }).catch(function (e2) { var m = String(e2 && e2.message); var k = Object.keys(MSG).filter(function (x) { return m.indexOf(x) >= 0; })[0]; err.textContent = k ? MSG[k] : 'No se ha podido guardar. Revisa la conexión.'; });
        return;
      }
      var id = 'm' + Date.now();
      S.fechas.push({ id: id, dia: dia, franja: franja, nota: nota, por: yo(), vienen: [] });
      S.vienen.push(id); guardar(); recien = id;
      cerrarHoja(); pintarFechas();
      aviso('Fecha propuesta: ' + fechaPartes(dia).largo);
    });
  });

  // ---------- el plan ----------
  function pintarPlan() {
    var total = miembros().length, fs = todasFechas(), m = mejorFecha(fs), h = '';
    h += '<section class="bloque"><h3>Pinta que va a ser el</h3>' + (m ?
      '<div class="grande">' + esc(fechaPartes(m.dia).largo) + ' · ' + esc(m.franja.toLowerCase()) + '</div>' +
      '<div class="quien" style="margin-top:10px">' + avs(m.vienen, 6) + '<span>' + m.vienen.length + ' de ' + total + ' pueden</span></div>'
      : '<p class="sub" style="margin:0">Aún nadie ha marcado fechas.</p>') + '</section>';

    // Ranking de temáticas: podio con las tres primeras y el resto en lista
    var temas = T.map(function (c, k) { return { c: c, n: quienesTema(c.id).length, k: k }; })
      .sort(function (a, b) { return b.n - a.n || a.k - b.k; });
    var esc3 = [temas[1], temas[0], temas[2]], clase = ['p2', 'p1', 'p3'], puesto = ['2.º', '1.º', '3.º'];
    h += '<section class="bloque"><h3>Ranking de temáticas</h3><div class="podio">' + esc3.map(function (x, k) {
      return '<div class="escalon ' + clase[k] + '"><span class="tema-ic">' + svg(x.c.d) + '</span><span class="nom">' + esc(x.c.nombre) + '</span>' +
        '<div class="caja"><span class="puesto">' + puesto[k] + '</span><span class="vts">' + x.n + (x.n === 1 ? ' voto' : ' votos') + '</span></div></div>';
    }).join('') + '</div><div class="resto">' + temas.slice(3).map(function (x, k) {
      return '<div class="resto-f"><span class="n">' + (k + 4) + '.º</span><span class="nm">' + esc(x.c.nombre) + '</span><span class="num-v">' + x.n + '</span></div>';
    }).join('') + '</div></section>';

    // Ranking de tours: los 5 más votados, con su enlace a la ficha
    var tours = Object.keys(TOUR).map(function (id) { return { id: id, n: quienesTour(id).length }; })
      .filter(function (x) { return x.n > 0; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 5);
    h += '<section class="bloque"><h3>Ranking de tours</h3><div class="rk">' + (tours.length ? tours.map(function (x, k) {
      var o = TOUR[x.id], q = quienesTour(x.id);
      return '<details class="rk-t"><summary><img src="img/' + x.id + '.jpg" alt="" style="object-position:50% ' + (o.t.foco || 50) + '%">' +
        '<span class="txt"><b>' + (k + 1) + '. ' + esc(o.t.t) + '</b><span>' + esc(o.cat.nombre) + ' · ' + esc(o.t.dur) + '</span></span>' +
        '<span class="cuenta">' + x.n + svg(CORAZON, 'icf', 14) + '</span></summary>' +
        '<div class="rk-mas"><p>' + esc(o.t.breve) + '</p>' +
        '<details class="quien-rk"><summary>¿Quién?' + svg('M6 9l6 6 6-6', 'ic', 16) + '</summary><div class="grupo">' + q.map(function (n) {
          return '<span class="miembro"><span class="av' + (esYo(n) || n === 'Tú' ? ' yo' : '') + '">' + esc(ini(n)) + '</span>' + esc(n) + '</span>';
        }).join('') + '</div></details>' +
        '<a class="mini" href="' + esc(o.t.u) + '" target="_blank" rel="noopener">Ver ficha en ' + esc(o.t.web) + svg(EXTERNO, 'ic', 13) + '</a></div></details>';
    }).join('') : '<p class="sub" style="margin:0">Aún no hay votos.</p>') + '</div></section>';
    h += '<section class="bloque"><h3>Pipol · ' + total + '</h3><div class="grupo">' + miembros().map(function (n) {
      var nt = n === yo() ? S.tours.length : Object.keys(G.si).filter(function (k) { return G.si[k].indexOf(n) >= 0; }).length;
      return '<span class="miembro"><span class="av' + (n === yo() ? ' yo' : '') + '">' + esc(ini(n)) + '</span>' + esc(n === yo() ? n + ' (tú)' : n) + ' · ' + nt + (nt === 1 ? ' tour' : ' tours') + '</span>';
    }).join('') + '</div></section>';
    h += '<section class="bloque"><h3>Antes de ir</h3>' + CONSEJOS.map(function (c) {
      return '<details><summary>' + esc(c.t) + svg('M6 9l6 6 6-6', 'ic', 18) + '</summary><p>' + esc(c.d) + '</p></details>';
    }).join('') + '</section>';
    $('#plan').innerHTML = h;
  }

  // ---------- arranque ----------
  function pintarTodo() { pintarPerfil(); pintarCarrusel(); pintarBaraja(false); if (vista === 'fechas') pintarFechas(); if (vista === 'plan') pintarPlan(); }
  pintarTodo();
  var primera = $('#baraja .carta[data-d="0"]');
  if (primera) primera.classList.add('amago');
  if (!S.me) mostrarEntrada();
  if (ONLINE) {
    $('.aviso').hidden = true;
    $('#f-entrada .peque').hidden = true;
    refrescar();
    setInterval(function () { if (!document.hidden) refrescar(); }, 30000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) refrescar(); });
  }
})();
