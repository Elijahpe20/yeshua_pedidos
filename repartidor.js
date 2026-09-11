const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_PUBLISHABLE_KEY);

const LLAVE_REPARTIDOR = 'yeshua_repartidor_id';

const el = (id) => document.getElementById(id);

const selectRepartidor = el('select-repartidor');
const seccionMisPedidos = el('seccion-mis-pedidos');
const seccionHistorial = el('seccion-historial');
const listaMisPedidos = el('lista-mis-pedidos');
const listaHistorial = el('lista-historial');
const mensajeEstado = el('mensaje-estado');

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
      <button type="button" class="primario btn-entregado">Marcar Entregado</button>
      <button type="button" class="secundario btn-mostrar-cancelar">Cancelar pedido</button>
    `;
  }
  return '';
}

function enlazarAccionesTarjetas(pedidos) {
  document.querySelectorAll('.pedido-card').forEach(tarjeta => {
    const pedidoId = tarjeta.dataset.id;

    tarjeta.querySelector('.btn-aceptar')?.addEventListener('click', () => cambiarEstado(pedidoId, 'Aceptado', { fecha_hora_aceptado: new Date().toISOString() }));
    tarjeta.querySelector('.btn-en-camino')?.addEventListener('click', () => cambiarEstado(pedidoId, 'EnCamino', {}));
    tarjeta.querySelector('.btn-entregado')?.addEventListener('click', () => cambiarEstado(pedidoId, 'Entregado', { fecha_hora_entregado: new Date().toISOString() }));

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
