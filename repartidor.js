const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_PUBLISHABLE_KEY);

const LLAVE_REPARTIDOR = 'yeshua_repartidor_id';

const el = (id) => document.getElementById(id);

const selectRepartidor = el('select-repartidor');
const seccionMisPedidos = el('seccion-mis-pedidos');
const seccionHistorial = el('seccion-historial');
const listaMisPedidos = el('lista-mis-pedidos');
const listaHistorial = el('lista-historial');
const mensajeEstado = el('mensaje-estado');

const MEDIOS_PAGO = ['Efectivo', 'Yape / Plin / Transf.', 'FISE', 'POS', 'Credito'];
const REQUIEREN_COMPROBANTE = ['Yape / Plin / Transf.', 'POS', 'Credito'];

const CODIGOS_CANCELACION = [
  ['X1 - Cancelado en puerta / Cliente ya no lo requiere', 'X1 - Cancelado en puerta / Cliente ya no lo requiere'],
  ['X2 - Compro a la competencia', 'X2 - Compró a la competencia'],
  ['X3 - Domicilio cerrado / Sin atencion', 'X3 - Domicilio cerrado / Sin atención'],
  ['X4 - Direccion incorrecta / Error de moto', 'X4 - Dirección incorrecta / Error de moto'],
  ['X5 - Tardanza en entrega', 'X5 - Tardanza en entrega'],
  ['X6 - Falta de stock', 'X6 - Falta de stock']
];

function mostrar(elemento) { elemento.classList.remove('oculto'); }
function ocultar(elemento) { elemento.classList.add('oculto'); }

function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

function formatearFecha(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function mostrarMensaje(texto, tipo) {
  mensajeEstado.textContent = texto;
  mensajeEstado.className = 'mensaje-estado ' + tipo;
  mostrar(mensajeEstado);
  setTimeout(() => ocultar(mensajeEstado), 6000);
}

function nombreRepartidorActual() {
  const opcion = selectRepartidor.selectedOptions[0];
  return opcion ? opcion.textContent : 'Repartidor';
}

// -------- Cargar lista de repartidores --------
async function cargarRepartidores() {
  const { data, error } = await sb
    .from('repartidores')
    .select('*')
    .eq('activo', true)
    .order('nombre');

  if (error) { mostrarMensaje('Error cargando repartidores: ' + error.message, 'error'); return; }

  selectRepartidor.innerHTML = '<option value="">— Selecciona tu nombre —</option>' +
    (data || []).map(r => `<option value="${r.repartidor_id}">${escaparHtml(r.nombre)}</option>`).join('');

  const guardado = localStorage.getItem(LLAVE_REPARTIDOR);
  if (guardado && (data || []).some(r => r.repartidor_id === guardado)) {
    selectRepartidor.value = guardado;
    activarRepartidor();
  }
}

selectRepartidor.addEventListener('change', () => {
  if (selectRepartidor.value) {
    localStorage.setItem(LLAVE_REPARTIDOR, selectRepartidor.value);
    activarRepartidor();
  } else {
    localStorage.removeItem(LLAVE_REPARTIDOR);
    ocultar(seccionMisPedidos);
    ocultar(seccionHistorial);
  }
});

function activarRepartidor() {
  mostrar(seccionMisPedidos);
  mostrar(seccionHistorial);
  cargarMisPedidos();
  cargarHistorial();
  iniciarCompartirUbicacion();
}

// -------- Compartir ubicación en vivo (Fase 6: asignación por cercanía) --------
let intervaloUbicacion = null;

function iniciarCompartirUbicacion() {
  if (intervaloUbicacion || !navigator.geolocation) return;
  compartirUbicacionAhora();
  intervaloUbicacion = setInterval(compartirUbicacionAhora, 90000);
}

function compartirUbicacionAhora() {
  const repartidorId = selectRepartidor.value;
  if (!repartidorId) return;

  navigator.geolocation.getCurrentPosition(
    (posicion) => {
      sb.from('repartidores').update({
        ultima_lat: posicion.coords.latitude,
        ultima_lng: posicion.coords.longitude,
        ultima_ubicacion_en: new Date().toISOString()
      }).eq('repartidor_id', repartidorId);
    },
    () => { /* sin permiso o sin señal: se reintenta en el próximo ciclo */ },
    { timeout: 8000, maximumAge: 60000 }
  );
}

// -------- Mis pedidos activos --------
async function cargarMisPedidos() {
  const repartidorId = selectRepartidor.value;
  if (!repartidorId) return;

  const { data, error } = await sb
    .from('pedidos')
    .select('*, clientes(nombre_o_negocio, telefono)')
    .eq('repartidor_asignado_id', repartidorId)
    .in('estado', ['Asignado', 'Aceptado', 'EnCamino'])
    .order('fecha_hora_asignado', { ascending: true });

  if (error) {
    listaMisPedidos.innerHTML = `<p class="ayuda">Error: ${escaparHtml(error.message)}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    listaMisPedidos.innerHTML = '<p class="ayuda">No tienes pedidos asignados por ahora.</p>';
    return;
  }

  listaMisPedidos.innerHTML = data.map(p => tarjetaPedido(p)).join('');
  enlazarAccionesTarjetas(data);
}

function tarjetaPedido(p) {
  const cliente = p.clientes?.nombre_o_negocio || p.clientes?.telefono || 'Cliente';
  return `
    <div class="pedido-card" data-id="${p.pedido_id}">
      <div class="pedido-header">
        <h3>${escaparHtml(cliente)}</h3>
        <span class="pill ${p.estado}">${p.estado}</span>
      </div>
      <div class="pedido-campo"><strong>Dirección:</strong> ${escaparHtml(p.direccion_entrega || 'Sin dirección')}</div>
      <div class="pedido-campo"><strong>Barrio:</strong> ${escaparHtml(p.barrio_sector)}</div>
      <div class="pedido-campo"><strong>Producto:</strong> ${p.cantidad} x ${escaparHtml(p.producto)}</div>
      <div class="pedido-campo"><strong>Precio:</strong> S/ ${Number(p.precio).toFixed(2)}</div>
      ${p.medio_pago_previsto ? `<div class="pedido-campo"><strong>Pago previsto:</strong> ${escaparHtml(p.medio_pago_previsto)}</div>` : ''}
      ${p.notas ? `<div class="pedido-campo"><strong>Notas:</strong> ${escaparHtml(p.notas)}</div>` : ''}

      <div class="acciones">
        ${botonesSegunEstado(p)}
      </div>

      <div class="bloque-entrega oculto">
        <label>Medio(s) de pago recibido(s) *</label>
        <div class="medios-pago">
          ${MEDIOS_PAGO.map(m => `<label class="chk-etiqueta"><input type="checkbox" class="chk-medio" value="${m}"> ${m === 'Credito' ? 'Crédito' : m}</label>`).join('')}
        </div>
        <div class="montos-pago"></div>
        <p class="suma-pago ayuda"></p>
        <div class="fila-aclaracion oculto">
          <label>Aclaración (opcional)</label>
          <textarea class="texto-aclaracion" rows="2" placeholder="Ej: FISE cubrió parte, quedó un saldo en efectivo"></textarea>
        </div>
        <div class="fila-comprobante oculto">
          <label class="label-comprobante">Foto(s) de comprobante</label>
          <input type="file" class="input-comprobante" accept="image/*" capture="environment" multiple>
        </div>
        <button type="button" class="primario btn-confirmar-entrega">Confirmar entrega</button>
      </div>

      <div class="bloque-peligro oculto bloque-cancelar-tarjeta">
        <label>Motivo de la cancelación *</label>
        <select class="motivo-cancelacion">
          <option value="">— Seleccionar motivo —</option>
          ${CODIGOS_CANCELACION.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
        </select>
        <button type="button" class="peligro btn-confirmar-cancelar">Confirmar cancelación</button>
      </div>

      <div class="bloque-reportar">
        <label>¿Algo salió mal? Reporta un problema (no cierra el pedido)</label>
        <textarea class="texto-incidencia" rows="2" placeholder="Ej: no encuentro la dirección, cliente no contesta..."></textarea>
        <button type="button" class="secundario btn-reportar">Reportar un problema</button>
      </div>
    </div>
  `;
}

function botonesSegunEstado(p) {
  if (p.estado === 'Asignado') {
    return `<button type="button" class="primario btn-aceptar">Aceptar pedido</button>`;
  }
  if (p.estado === 'Aceptado') {
    return `<button type="button" class="primario btn-en-camino">Salir en camino</button>`;
  }
  if (p.estado === 'EnCamino') {
    return `
      <button type="button" class="primario btn-mostrar-entrega">Marcar Entregado</button>
      <button type="button" class="secundario btn-mostrar-cancelar">Cancelar pedido</button>
    `;
  }
  return '';
}

function enlazarAccionesTarjetas(pedidos) {
  document.querySelectorAll('.pedido-card').forEach(tarjeta => {
    const pedidoId = tarjeta.dataset.id;
    const pedido = pedidos.find(x => x.pedido_id === pedidoId);

    tarjeta.querySelector('.btn-aceptar')?.addEventListener('click', () => cambiarEstado(pedidoId, 'Aceptado', { fecha_hora_aceptado: new Date().toISOString() }));
    tarjeta.querySelector('.btn-en-camino')?.addEventListener('click', () => cambiarEstado(pedidoId, 'EnCamino', {}));

    tarjeta.querySelector('.btn-mostrar-entrega')?.addEventListener('click', () => {
      mostrar(tarjeta.querySelector('.bloque-entrega'));
    });

    tarjeta.querySelectorAll('.chk-medio').forEach(chk => {
      chk.addEventListener('change', () => actualizarFormularioPago(tarjeta, pedido));
    });

    tarjeta.querySelector('.btn-confirmar-entrega')?.addEventListener('click', () => confirmarEntrega(pedido, tarjeta));

    tarjeta.querySelector('.btn-mostrar-cancelar')?.addEventListener('click', () => {
      mostrar(tarjeta.querySelector('.bloque-cancelar-tarjeta'));
    });

    tarjeta.querySelector('.btn-confirmar-cancelar')?.addEventListener('click', () => {
      const motivo = tarjeta.querySelector('.motivo-cancelacion').value;
      if (!motivo) { mostrarMensaje('Elige el motivo de la cancelación.', 'error'); return; }
      if (!confirm('¿Seguro que quieres cancelar este pedido?')) return;
      cambiarEstado(pedidoId, 'Cancelado', { codigo_cancelacion: motivo });
    });

    tarjeta.querySelector('.btn-reportar')?.addEventListener('click', () => {
      const texto = tarjeta.querySelector('.texto-incidencia').value.trim();
      reportarProblema(pedidoId, texto, tarjeta);
    });
  });
}

// -------- Formulario de pago al marcar Entregado --------
function actualizarFormularioPago(tarjeta, pedido) {
  const marcados = [...tarjeta.querySelectorAll('.chk-medio:checked')].map(c => c.value);
  const contenedorMontos = tarjeta.querySelector('.montos-pago');
  const filaAclaracion = tarjeta.querySelector('.fila-aclaracion');
  const filaComprobante = tarjeta.querySelector('.fila-comprobante');
  const labelComprobante = tarjeta.querySelector('.label-comprobante');

  if (marcados.length === 0) {
    contenedorMontos.innerHTML = '';
  } else if (marcados.length === 1) {
    contenedorMontos.innerHTML = `<p class="pedido-campo"><strong>Monto (${marcados[0] === 'Credito' ? 'Crédito' : marcados[0]}):</strong> S/ ${Number(pedido.precio).toFixed(2)}</p>`;
  } else {
    contenedorMontos.innerHTML = marcados.map(m => `
      <div class="fila">
        <label>Monto ${m === 'Credito' ? 'Crédito' : m}</label>
        <input type="number" class="input-monto" data-medio="${m}" min="0" step="0.10">
      </div>
    `).join('');
    contenedorMontos.querySelectorAll('.input-monto').forEach(inp => {
      inp.addEventListener('input', () => actualizarSumaPago(tarjeta, pedido));
    });
  }

  if (marcados.length >= 2) { mostrar(filaAclaracion); } else { ocultar(filaAclaracion); }

  const necesitaComprobante = marcados.some(m => REQUIEREN_COMPROBANTE.includes(m));
  if (marcados.length > 0) {
    mostrar(filaComprobante);
    labelComprobante.textContent = necesitaComprobante ? 'Foto(s) de comprobante *' : 'Foto(s) de comprobante (opcional)';
  } else {
    ocultar(filaComprobante);
  }

  actualizarSumaPago(tarjeta, pedido);
}

function actualizarSumaPago(tarjeta, pedido) {
  const marcados = [...tarjeta.querySelectorAll('.chk-medio:checked')].map(c => c.value);
  const resumen = tarjeta.querySelector('.suma-pago');

  if (marcados.length < 2) { resumen.textContent = ''; return; }

  const montos = [...tarjeta.querySelectorAll('.input-monto')].map(i => Number(i.value) || 0);
  const suma = montos.reduce((a, b) => a + b, 0);
  const precio = Number(pedido.precio);

  if (Math.abs(suma - precio) < 0.01) {
    resumen.textContent = `✓ Suma: S/ ${suma.toFixed(2)} — coincide con el precio.`;
    resumen.style.color = '#1f7a2b';
  } else {
    resumen.textContent = `⚠ Suma: S/ ${suma.toFixed(2)} — el precio es S/ ${precio.toFixed(2)}. Corrige los montos.`;
    resumen.style.color = '#a12b2b';
  }
}

function obtenerMontosPago(tarjeta, pedido) {
  const marcados = [...tarjeta.querySelectorAll('.chk-medio:checked')].map(c => c.value);
  if (marcados.length === 0) return null;

  if (marcados.length === 1) {
    return [{ tipo: marcados[0], monto: Number(pedido.precio) }];
  }

  const medios = [...tarjeta.querySelectorAll('.input-monto')].map(i => ({
    tipo: i.dataset.medio,
    monto: Number(i.value) || 0
  }));
  const suma = medios.reduce((a, m) => a + m.monto, 0);
  if (Math.abs(suma - Number(pedido.precio)) >= 0.01) return 'DESCUADRE';
  return medios;
}

async function confirmarEntrega(pedido, tarjeta) {
  const marcados = [...tarjeta.querySelectorAll('.chk-medio:checked')].map(c => c.value);
  if (marcados.length === 0) { mostrarMensaje('Marca al menos un medio de pago.', 'error'); return; }

  const medios = obtenerMontosPago(tarjeta, pedido);
  if (medios === 'DESCUADRE') { mostrarMensaje('Los montos no suman el precio del pedido. Corrígelos o usa "Reportar un problema".', 'error'); return; }

  const necesitaComprobante = marcados.some(m => REQUIEREN_COMPROBANTE.includes(m));
  const archivos = tarjeta.querySelector('.input-comprobante').files;
  if (necesitaComprobante && archivos.length === 0) {
    mostrarMensaje('Falta la foto del comprobante (obligatoria para Yape/Plin/Transf., POS o Crédito).', 'error');
    return;
  }

  const boton = tarjeta.querySelector('.btn-confirmar-entrega');
  boton.disabled = true;
  boton.textContent = 'Guardando...';

  try {
    const urls = [];
    for (const archivo of archivos) {
      const ruta = `${pedido.pedido_id}/${Date.now()}_${archivo.name}`;
      const { error: errorSubida } = await sb.storage.from('comprobantes').upload(ruta, archivo);
      if (errorSubida) throw errorSubida;
      const { data: urlData } = sb.storage.from('comprobantes').getPublicUrl(ruta);
      urls.push(urlData.publicUrl);
    }

    const aclaracion = tarjeta.querySelector('.texto-aclaracion').value.trim();

    const { error } = await sb
      .from('pedidos')
      .update({
        estado: 'Entregado',
        fecha_hora_entregado: new Date().toISOString(),
        medio_pago_real: { medios, aclaracion: aclaracion || null },
        voucher_fotos: urls.length ? urls : null
      })
      .eq('pedido_id', pedido.pedido_id);

    if (error) throw error;

    capturarPinCliente(pedido.cliente_id);

    mostrarMensaje('Pedido entregado y registrado.', 'ok');
    cargarMisPedidos();
    cargarHistorial();
  } catch (err) {
    mostrarMensaje('Error guardando la entrega: ' + err.message, 'error');
    boton.disabled = false;
    boton.textContent = 'Confirmar entrega';
  }
}

function capturarPinCliente(clienteId) {
  if (!navigator.geolocation) return;

  navigator.geolocation.getCurrentPosition(
    async (posicion) => {
      await sb.from('clientes').update({
        pin_lat: posicion.coords.latitude,
        pin_lng: posicion.coords.longitude,
        pin_fecha_actualizacion: new Date().toISOString()
      }).eq('cliente_id', clienteId);
    },
    () => { /* sin ubicación disponible: no bloquea la entrega, se ignora */ },
    { timeout: 8000, maximumAge: 60000 }
  );
}

async function cambiarEstado(pedidoId, nuevoEstado, camposExtra) {
  const { error } = await sb
    .from('pedidos')
    .update({ estado: nuevoEstado, ...camposExtra })
    .eq('pedido_id', pedidoId);

  if (error) { mostrarMensaje('Error actualizando el pedido: ' + error.message, 'error'); return; }

  mostrarMensaje('Pedido actualizado a "' + nuevoEstado + '".', 'ok');
  cargarMisPedidos();
  cargarHistorial();
}

async function reportarProblema(pedidoId, descripcion, tarjeta) {
  if (!descripcion) { mostrarMensaje('Escribe qué problema hay.', 'error'); return; }

  const { error } = await sb
    .from('incidencias')
    .insert({
      pedido_id: pedidoId,
      reportado_por: nombreRepartidorActual(),
      descripcion
    });

  if (error) { mostrarMensaje('Error reportando el problema: ' + error.message, 'error'); return; }

  tarjeta.querySelector('.texto-incidencia').value = '';
  mostrarMensaje('Problema reportado. Un supervisor lo va a revisar.', 'ok');
}

// -------- Historial reciente --------
async function cargarHistorial() {
  const repartidorId = selectRepartidor.value;
  if (!repartidorId) return;

  const { data, error } = await sb
    .from('pedidos')
    .select('*, clientes(nombre_o_negocio, telefono)')
    .eq('repartidor_asignado_id', repartidorId)
    .in('estado', ['Entregado', 'Cancelado'])
    .order('fecha_hora_creado', { ascending: false })
    .limit(10);

  if (error) {
    listaHistorial.innerHTML = `<p class="ayuda">Error: ${escaparHtml(error.message)}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    listaHistorial.innerHTML = '<p class="ayuda">Todavía no tienes pedidos entregados o cancelados.</p>';
    return;
  }

  listaHistorial.innerHTML = data.map(p => `
    <div class="pedido-campo">
      <span class="pill ${p.estado}">${p.estado}</span>
      ${escaparHtml(p.clientes?.nombre_o_negocio || p.clientes?.telefono || 'Cliente')} —
      ${p.cantidad} x ${escaparHtml(p.producto)} —
      ${formatearFecha(p.fecha_hora_entregado || p.fecha_hora_creado)}
    </div>
  `).join('');
}

// -------- Inicio --------
cargarRepartidores();
