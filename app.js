const sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_PUBLISHABLE_KEY);

// -------- Estado en memoria --------
let clienteSeleccionadoId = null;     // null = cliente nuevo
let pedidoEnEdicionId = null;         // null = pedido nuevo
let direccionesClienteActual = [];    // direcciones del cliente activo en el formulario
let direccionEntregaOriginalEdicion = null; // snapshot de texto al entrar en modo edición
let direccionEnEdicionId = null;      // id de la dirección que se está editando en línea

// -------- Referencias a elementos --------
const el = (id) => document.getElementById(id);

const buscarClienteInput = el('buscar-cliente');
const resultadosCliente = el('resultados-cliente');
const bannerCliente = el('banner-cliente');

const cliTelefono = el('cli-telefono');
const cliNombre = el('cli-nombre');
const cliTipo = el('cli-tipo');
const cliNotas = el('cli-notas');

const listaDirecciones = el('lista-direcciones');
const nuevaDireccionTexto = el('nueva-direccion-texto');
const nuevaDireccionEtiqueta = el('nueva-direccion-etiqueta');
const nuevaDireccionBarrio = el('nueva-direccion-barrio');

const pedDireccion = el('ped-direccion');
const pedDireccionAyuda = el('ped-direccion-ayuda');
const pedProducto = el('ped-producto');
const pedCantidad = el('ped-cantidad');
const pedPrecio = el('ped-precio');
const pedPago = el('ped-pago');
const pedOrigen = el('ped-origen');
const pedBarrio = el('ped-barrio');
const pedRecepcionista = el('ped-recepcionista');
const pedNotas = el('ped-notas');

const btnGuardarPedido = el('btn-guardar-pedido');
const btnCancelarEdicion = el('btn-cancelar-edicion');
const mensajeEstado = el('mensaje-estado');

const cuerpoTabla = el('cuerpo-tabla-pedidos');

const bloqueCancelar = el('bloque-cancelar');
const pedMotivoCancelacion = el('ped-motivo-cancelacion');
const listaIncidencias = el('lista-incidencias');
const bloquePinCliente = el('bloque-pin-cliente');

const bloquePagoMostrador = el('bloque-pago-mostrador');
const montosPagoMostrador = el('montos-pago-mostrador');
const sumaPagoMostrador = el('suma-pago-mostrador');
const filaAclaracionMostrador = el('fila-aclaracion-mostrador');
const aclaracionMostrador = el('aclaracion-mostrador');
const filaComprobanteMostrador = el('fila-comprobante-mostrador');
const labelComprobanteMostrador = el('label-comprobante-mostrador');
const inputComprobanteMostrador = el('input-comprobante-mostrador');

let repartidoresActivos = [];

const MEDIOS_PAGO = ['Efectivo', 'Yape / Plin / Transf.', 'FISE', 'POS', 'Credito'];
const REQUIEREN_COMPROBANTE = ['Yape / Plin / Transf.', 'POS', 'Credito'];

// -------- Utilidades --------
function mostrar(elemento) { elemento.classList.remove('oculto'); }
function ocultar(elemento) { elemento.classList.add('oculto'); }

function mostrarMensaje(texto, tipo) {
  mensajeEstado.textContent = texto;
  mensajeEstado.className = 'mensaje-estado ' + tipo;
  mostrar(mensajeEstado);
  setTimeout(() => ocultar(mensajeEstado), 6000);
}

function formatearFecha(iso) {
  const d = new Date(iso);
  return d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function escaparHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

function actualizarBannerCliente(modo, nombre) {
  if (modo === 'existente') {
    bannerCliente.textContent = `✓ Cliente existente seleccionado: ${nombre || 'sin nombre registrado'}`;
    bannerCliente.className = 'banner';
  } else {
    bannerCliente.textContent = '＋ Vas a crear un cliente nuevo';
    bannerCliente.className = 'banner banner-nuevo';
  }
}

function limpiarFormularioCliente() {
  clienteSeleccionadoId = null;
  cliTelefono.value = '';
  cliNombre.value = '';
  cliTipo.value = '';
  cliNotas.value = '';
  buscarClienteInput.value = '';
  resultadosCliente.innerHTML = '';
  nuevaDireccionTexto.value = '';
  nuevaDireccionEtiqueta.value = '';
  nuevaDireccionBarrio.value = 'Por Asignar';
  direccionesClienteActual = [];
  renderDirecciones();
  renderSelectDireccionPedido();
  actualizarBannerCliente('nuevo');
  ocultar(bloquePinCliente);
}

function limpiarFormularioPedido() {
  pedidoEnEdicionId = null;
  window.__estadoPedidoEnEdicion = null;
  direccionEntregaOriginalEdicion = null;
  pedProducto.value = '';
  pedCantidad.value = 1;
  pedPrecio.value = '';
  pedPago.value = '';
  pedOrigen.value = '';
  pedBarrio.value = 'Por Asignar';
  pedNotas.value = '';
  pedMotivoCancelacion.value = '';
  // quién toma el pedido se mantiene entre pedidos (misma persona seguido)
  btnGuardarPedido.textContent = 'Guardar pedido';
  ocultar(btnCancelarEdicion);
  ocultar(bloqueCancelar);
  habilitarCamposPedido(true);
  limpiarPagoMostrador();
}

function limpiarPagoMostrador() {
  document.querySelectorAll('.chk-medio-mostrador').forEach(chk => { chk.checked = false; });
  montosPagoMostrador.innerHTML = '';
  sumaPagoMostrador.textContent = '';
  aclaracionMostrador.value = '';
  inputComprobanteMostrador.value = '';
  ocultar(bloquePagoMostrador);
  ocultar(filaAclaracionMostrador);
  ocultar(filaComprobanteMostrador);
  mostrar(pedPago.closest('.fila'));
  pedDireccion.required = true;
}

pedOrigen.addEventListener('change', () => {
  if (pedOrigen.value === 'Venta en Casa') {
    mostrar(bloquePagoMostrador);
    ocultar(pedPago.closest('.fila'));
    pedDireccion.required = false;
  } else {
    ocultar(bloquePagoMostrador);
    mostrar(pedPago.closest('.fila'));
    pedDireccion.required = true;
  }
});

document.querySelectorAll('.chk-medio-mostrador').forEach(chk => {
  chk.addEventListener('change', actualizarFormularioPagoMostrador);
});

function actualizarFormularioPagoMostrador() {
  const marcados = [...document.querySelectorAll('.chk-medio-mostrador:checked')].map(c => c.value);
  const precio = Number(pedPrecio.value) || 0;

  if (marcados.length === 0) {
    montosPagoMostrador.innerHTML = '';
  } else if (marcados.length === 1) {
    montosPagoMostrador.innerHTML = `<p class="pedido-campo"><strong>Monto (${marcados[0] === 'Credito' ? 'Crédito' : marcados[0]}):</strong> S/ ${precio.toFixed(2)}</p>`;
  } else {
    montosPagoMostrador.innerHTML = marcados.map(m => `
      <div class="fila">
        <label>Monto ${m === 'Credito' ? 'Crédito' : m}</label>
        <input type="number" class="input-monto-mostrador" data-medio="${m}" min="0" step="0.10">
      </div>
    `).join('');
    montosPagoMostrador.querySelectorAll('.input-monto-mostrador').forEach(inp => {
      inp.addEventListener('input', actualizarSumaPagoMostrador);
    });
  }

  if (marcados.length >= 2) { mostrar(filaAclaracionMostrador); } else { ocultar(filaAclaracionMostrador); }

  const necesitaComprobante = marcados.some(m => REQUIEREN_COMPROBANTE.includes(m));
  if (marcados.length > 0) {
    mostrar(filaComprobanteMostrador);
    labelComprobanteMostrador.textContent = necesitaComprobante ? 'Foto(s) de comprobante *' : 'Foto(s) de comprobante (opcional)';
  } else {
    ocultar(filaComprobanteMostrador);
  }

  actualizarSumaPagoMostrador();
}

function actualizarSumaPagoMostrador() {
  const marcados = [...document.querySelectorAll('.chk-medio-mostrador:checked')].map(c => c.value);
  if (marcados.length < 2) { sumaPagoMostrador.textContent = ''; return; }

  const montos = [...document.querySelectorAll('.input-monto-mostrador')].map(i => Number(i.value) || 0);
  const suma = montos.reduce((a, b) => a + b, 0);
  const precio = Number(pedPrecio.value) || 0;

  if (Math.abs(suma - precio) < 0.01) {
    sumaPagoMostrador.textContent = `✓ Suma: S/ ${suma.toFixed(2)} — coincide con el precio.`;
    sumaPagoMostrador.style.color = '#1f7a2b';
  } else {
    sumaPagoMostrador.textContent = `⚠ Suma: S/ ${suma.toFixed(2)} — el precio es S/ ${precio.toFixed(2)}. Corrige los montos.`;
    sumaPagoMostrador.style.color = '#a12b2b';
  }
}

function obtenerMontosPagoMostrador() {
  const marcados = [...document.querySelectorAll('.chk-medio-mostrador:checked')].map(c => c.value);
  if (marcados.length === 0) return null;

  if (marcados.length === 1) {
    return [{ tipo: marcados[0], monto: Number(pedPrecio.value) || 0 }];
  }

  const medios = [...document.querySelectorAll('.input-monto-mostrador')].map(i => ({
    tipo: i.dataset.medio,
    monto: Number(i.value) || 0
  }));
  const suma = medios.reduce((a, m) => a + m.monto, 0);
  if (Math.abs(suma - (Number(pedPrecio.value) || 0)) >= 0.01) return 'DESCUADRE';
  return medios;
}

function habilitarCamposPedido(habilitado) {
  [pedProducto, pedCantidad, pedPrecio, pedPago, pedOrigen, pedDireccion, pedRecepcionista, pedNotas,
   cliTelefono, cliNombre, cliTipo, cliNotas].forEach(campo => {
    campo.disabled = !habilitado;
  });
  // barrio_sector siempre editable, incluso en pedidos ya cerrados
  pedBarrio.disabled = false;
}

// -------- Direcciones del cliente --------
async function cargarDireccionesCliente(clienteId) {
  direccionEnEdicionId = null;
  if (!clienteId) {
    direccionesClienteActual = [];
    renderDirecciones();
    renderSelectDireccionPedido();
    return;
  }

  const { data, error } = await sb
    .from('direcciones_cliente')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('creado_en', { ascending: true });

  if (error) {
    mostrarMensaje('Error cargando direcciones: ' + error.message, 'error');
    return;
  }

  direccionesClienteActual = data || [];
  renderDirecciones();
  renderSelectDireccionPedido();
}

function renderDirecciones() {
  if (!clienteSeleccionadoId) {
    listaDirecciones.innerHTML = '<p class="ayuda">Busca o crea el cliente para ver y agregar sus direcciones.</p>';
    return;
  }

  if (direccionesClienteActual.length === 0) {
    listaDirecciones.innerHTML = '<p class="ayuda">Este cliente todavía no tiene direcciones guardadas. Agrega una abajo.</p>';
    return;
  }

  const opcionesBarrio = nuevaDireccionBarrio.innerHTML;

  listaDirecciones.innerHTML = direccionesClienteActual.map(d => {
    if (d.direccion_id === direccionEnEdicionId) {
      return `
        <div class="direccion-item" data-id="${d.direccion_id}">
          <textarea class="editar-direccion-texto" rows="2">${escaparHtml(d.direccion)}</textarea>
          <div class="fila-doble">
            <input type="text" class="editar-direccion-etiqueta" placeholder="Etiqueta (opcional)" value="${escaparHtml(d.etiqueta || '')}">
            <select class="editar-direccion-barrio">${opcionesBarrio}</select>
          </div>
          <div class="direccion-acciones">
            <button type="button" data-accion="guardar-edicion" data-id="${d.direccion_id}">Guardar</button>
            <button type="button" data-accion="cancelar-edicion" data-id="${d.direccion_id}">Cancelar</button>
          </div>
        </div>
      `;
    }

    return `
      <div class="direccion-item" data-id="${d.direccion_id}">
        <div class="direccion-texto">${d.etiqueta ? `<strong>${escaparHtml(d.etiqueta)}:</strong> ` : ''}${escaparHtml(d.direccion)}</div>
        <div class="direccion-meta">
          <span class="badge ${d.verificada ? 'verificada' : 'sin-verificar'}">${d.verificada ? '✓ Verificada' : '⚠ Sin confirmar'}</span>
          <span>${escaparHtml(d.barrio_sector)}</span>
          <div class="direccion-acciones">
            ${d.verificada ? '' : `<button type="button" data-accion="verificar" data-id="${d.direccion_id}">Marcar verificada</button>`}
            <button type="button" data-accion="editar" data-id="${d.direccion_id}">Editar</button>
            <button type="button" data-accion="eliminar" data-id="${d.direccion_id}">Eliminar</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  listaDirecciones.querySelectorAll('.editar-direccion-barrio').forEach(select => {
    const d = direccionesClienteActual.find(x => x.direccion_id === direccionEnEdicionId);
    if (d) select.value = d.barrio_sector;
  });

  listaDirecciones.querySelectorAll('button[data-accion]').forEach(btn => {
    btn.addEventListener('click', () => {
      const accion = btn.dataset.accion;
      const id = btn.dataset.id;
      if (accion === 'verificar') marcarDireccionVerificada(id);
      if (accion === 'eliminar') eliminarDireccion(id);
      if (accion === 'editar') { direccionEnEdicionId = id; renderDirecciones(); }
      if (accion === 'cancelar-edicion') { direccionEnEdicionId = null; renderDirecciones(); }
      if (accion === 'guardar-edicion') guardarEdicionDireccion(id);
    });
  });
}

async function guardarEdicionDireccion(direccionId) {
  const item = listaDirecciones.querySelector(`.direccion-item[data-id="${direccionId}"]`);
  const texto = item.querySelector('.editar-direccion-texto').value.trim();
  const etiqueta = item.querySelector('.editar-direccion-etiqueta').value.trim();
  const barrio = item.querySelector('.editar-direccion-barrio').value;

  if (!texto) { mostrarMensaje('La dirección no puede quedar vacía.', 'error'); return; }

  const { error } = await sb
    .from('direcciones_cliente')
    .update({ direccion: texto, etiqueta: etiqueta || null, barrio_sector: barrio, verificada: true })
    .eq('direccion_id', direccionId);

  if (error) { mostrarMensaje('Error guardando dirección: ' + error.message, 'error'); return; }

  direccionEnEdicionId = null;
  mostrarMensaje('Dirección actualizada.', 'ok');
  await cargarDireccionesCliente(clienteSeleccionadoId);
}

function renderSelectDireccionPedido() {
  if (!clienteSeleccionadoId || direccionesClienteActual.length === 0) {
    pedDireccion.innerHTML = '<option value="">— Agrega una dirección al cliente arriba —</option>';
    mostrar(pedDireccionAyuda);
    return;
  }

  ocultar(pedDireccionAyuda);
  pedDireccion.innerHTML = '<option value="">— Seleccionar —</option>' + direccionesClienteActual.map(d => `
    <option value="${d.direccion_id}">${d.etiqueta ? escaparHtml(d.etiqueta) + ': ' : ''}${escaparHtml(d.direccion.slice(0, 60))}${d.verificada ? '' : ' (sin confirmar)'}</option>
  `).join('');
}

pedDireccion.addEventListener('change', () => {
  const d = direccionesClienteActual.find(x => x.direccion_id === pedDireccion.value);
  if (d) pedBarrio.value = d.barrio_sector;
});

async function marcarDireccionVerificada(direccionId) {
  const { error } = await sb.from('direcciones_cliente').update({ verificada: true }).eq('direccion_id', direccionId);
  if (error) { mostrarMensaje('Error: ' + error.message, 'error'); return; }
  await cargarDireccionesCliente(clienteSeleccionadoId);
  mostrarMensaje('Dirección marcada como verificada.', 'ok');
}

async function eliminarDireccion(direccionId) {
  if (!confirm('¿Eliminar esta dirección del cliente?')) return;
  const { error } = await sb.from('direcciones_cliente').delete().eq('direccion_id', direccionId);
  if (error) { mostrarMensaje('Error: ' + error.message, 'error'); return; }
  await cargarDireccionesCliente(clienteSeleccionadoId);
  mostrarMensaje('Dirección eliminada.', 'ok');
}

el('btn-agregar-direccion').addEventListener('click', agregarDireccion);

async function agregarDireccion() {
  const texto = nuevaDireccionTexto.value.trim();
  if (!texto) { mostrarMensaje('Escribe la dirección primero.', 'error'); return; }

  let idCliente = clienteSeleccionadoId;

  if (!idCliente) {
    const datosCli = {
      telefono: cliTelefono.value.trim() || null,
      nombre_o_negocio: cliNombre.value.trim() || null,
      tipo: cliTipo.value || null,
      notas: cliNotas.value.trim() || null
    };
    if (!datosCli.telefono && !datosCli.nombre_o_negocio) {
      mostrarMensaje('Escribe al menos el teléfono o el nombre del cliente antes de agregar una dirección.', 'error');
      return;
    }
    const { data, error } = await sb.from('clientes').insert(datosCli).select().single();
    if (error) { mostrarMensaje('Error creando cliente: ' + error.message, 'error'); return; }
    idCliente = data.cliente_id;
    clienteSeleccionadoId = idCliente;
    actualizarBannerCliente('existente', data.nombre_o_negocio || data.telefono);
  }

  const { error: errorDir } = await sb.from('direcciones_cliente').insert({
    cliente_id: idCliente,
    direccion: texto,
    etiqueta: nuevaDireccionEtiqueta.value.trim() || null,
    barrio_sector: nuevaDireccionBarrio.value,
    verificada: true
  });

  if (errorDir) { mostrarMensaje('Error agregando dirección: ' + errorDir.message, 'error'); return; }

  nuevaDireccionTexto.value = '';
  nuevaDireccionEtiqueta.value = '';
  nuevaDireccionBarrio.value = 'Por Asignar';
  mostrarMensaje('Dirección agregada.', 'ok');
  await cargarDireccionesCliente(idCliente);
}

// -------- Búsqueda de cliente --------
el('btn-buscar-cliente').addEventListener('click', buscarCliente);
buscarClienteInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); buscarCliente(); }
});

async function buscarCliente() {
  const q = buscarClienteInput.value.trim();
  if (!q) return;

  const { data, error } = await sb
    .from('clientes')
    .select('*')
    .or(`telefono.ilike.%${q}%,nombre_o_negocio.ilike.%${q}%`)
    .limit(10);

  if (error) {
    mostrarMensaje('Error buscando cliente: ' + error.message, 'error');
    return;
  }

  if (!data || data.length === 0) {
    resultadosCliente.innerHTML = '<li>Sin resultados — puedes crear un cliente nuevo.</li>';
    return;
  }

  resultadosCliente.innerHTML = data.map(c => `
    <li data-id="${c.cliente_id}">
      <strong>${escaparHtml(c.nombre_o_negocio || c.telefono || 'Sin nombre')}</strong> — ${escaparHtml(c.telefono || 'sin teléfono')}
    </li>
  `).join('');

  resultadosCliente.querySelectorAll('li[data-id]').forEach(li => {
    li.addEventListener('click', () => seleccionarCliente(data.find(c => c.cliente_id === li.dataset.id)));
  });
}

async function seleccionarCliente(cliente) {
  clienteSeleccionadoId = cliente.cliente_id;
  cliTelefono.value = cliente.telefono || '';
  cliNombre.value = cliente.nombre_o_negocio || '';
  cliTipo.value = cliente.tipo || '';
  cliNotas.value = cliente.notas || '';
  resultadosCliente.innerHTML = '';
  buscarClienteInput.value = '';
  actualizarBannerCliente('existente', cliente.nombre_o_negocio || cliente.telefono);
  await cargarDireccionesCliente(cliente.cliente_id);
  renderPinCliente(cliente);
}

function renderPinCliente(cliente) {
  if (!cliente || cliente.pin_lat == null || cliente.pin_lng == null) {
    ocultar(bloquePinCliente);
    return;
  }

  const fecha = cliente.pin_fecha_actualizacion ? formatearFecha(cliente.pin_fecha_actualizacion) : 'fecha desconocida';
  bloquePinCliente.innerHTML = `
    📍 Ubicación GPS guardada (confirmada: ${fecha})
    <button type="button" id="btn-borrar-pin" class="secundario" style="margin-left:0.6rem;">Borrar ubicación</button>
  `;
  bloquePinCliente.className = 'banner';
  mostrar(bloquePinCliente);

  el('btn-borrar-pin').addEventListener('click', async () => {
    if (!confirm('¿Borrar la ubicación GPS guardada de este cliente? Se usará solo la dirección de texto hasta que se capture una nueva.')) return;
    const { error } = await sb.from('clientes').update({ pin_lat: null, pin_lng: null, pin_fecha_actualizacion: null }).eq('cliente_id', clienteSeleccionadoId);
    if (error) { mostrarMensaje('Error borrando ubicación: ' + error.message, 'error'); return; }
    mostrarMensaje('Ubicación borrada.', 'ok');
    ocultar(bloquePinCliente);
  });
}

el('btn-cliente-nuevo').addEventListener('click', limpiarFormularioCliente);

// -------- Guardar solo los datos del cliente (sin pedido) --------
el('btn-guardar-cliente').addEventListener('click', guardarCliente);

async function guardarCliente() {
  if (!clienteSeleccionadoId && !cliTelefono.value.trim() && !cliNombre.value.trim()) {
    mostrarMensaje('Falta al menos el teléfono o el nombre.', 'error');
    return;
  }

  const datosCli = {
    telefono: cliTelefono.value.trim() || null,
    nombre_o_negocio: cliNombre.value.trim() || null,
    tipo: cliTipo.value || null,
    notas: cliNotas.value.trim() || null
  };

  try {
    if (clienteSeleccionadoId) {
      const { error } = await sb.from('clientes').update(datosCli).eq('cliente_id', clienteSeleccionadoId);
      if (error) throw error;
      mostrarMensaje('Datos del cliente actualizados.', 'ok');
    } else {
      const { data, error } = await sb.from('clientes').insert(datosCli).select().single();
      if (error) throw error;
      clienteSeleccionadoId = data.cliente_id;
      actualizarBannerCliente('existente', data.nombre_o_negocio || data.telefono);
      await cargarDireccionesCliente(clienteSeleccionadoId);
      mostrarMensaje('Cliente creado.', 'ok');
    }
  } catch (err) {
    mostrarMensaje('Error guardando cliente: ' + err.message, 'error');
  }
}

// -------- Guardar pedido (nuevo o edición) --------
btnGuardarPedido.addEventListener('click', guardarPedido);
btnCancelarEdicion.addEventListener('click', () => {
  limpiarFormularioPedido();
  limpiarFormularioCliente();
});

async function guardarPedido() {
  // Si estamos editando un pedido que ya salió de "Creado", solo se permite tocar el barrio.
  const editandoPedidoCerrado = pedidoEnEdicionId && window.__estadoPedidoEnEdicion !== 'Creado';

  if (editandoPedidoCerrado) {
    const { error } = await sb
      .from('pedidos')
      .update({
        barrio_sector: pedBarrio.value,
        ultima_edicion_por: pedRecepcionista.value.trim() || 'Sin especificar',
        ultima_edicion_en: new Date().toISOString()
      })
      .eq('pedido_id', pedidoEnEdicionId);

    if (error) { mostrarMensaje('Error guardando barrio: ' + error.message, 'error'); return; }
    mostrarMensaje('Barrio actualizado.', 'ok');
    limpiarFormularioPedido();
    limpiarFormularioCliente();
    cargarPedidosRecientes();
    return;
  }

  const esVentaEnCasa = pedOrigen.value === 'Venta en Casa' && !pedidoEnEdicionId;

  // Validación básica
  if (!esVentaEnCasa && !pedDireccion.value) { mostrarMensaje('Falta elegir la dirección de entrega.', 'error'); return; }
  if (!pedProducto.value) { mostrarMensaje('Falta elegir el producto.', 'error'); return; }
  if (!pedOrigen.value) { mostrarMensaje('Falta elegir el origen de la venta.', 'error'); return; }
  if (!pedPrecio.value) { mostrarMensaje('Falta el precio.', 'error'); return; }
  if (!pedRecepcionista.value.trim()) { mostrarMensaje('Falta indicar quién toma el pedido.', 'error'); return; }

  let mediosPagoMostrador = null;
  let comprobantesMostrador = [];
  if (esVentaEnCasa) {
    const marcados = [...document.querySelectorAll('.chk-medio-mostrador:checked')].map(c => c.value);
    if (marcados.length === 0) { mostrarMensaje('Marca al menos un medio de pago recibido.', 'error'); return; }

    mediosPagoMostrador = obtenerMontosPagoMostrador();
    if (mediosPagoMostrador === 'DESCUADRE') { mostrarMensaje('Los montos no suman el precio del pedido. Corrígelos.', 'error'); return; }

    const necesitaComprobante = marcados.some(m => REQUIEREN_COMPROBANTE.includes(m));
    if (necesitaComprobante && inputComprobanteMostrador.files.length === 0) {
      mostrarMensaje('Falta la foto del comprobante (obligatoria para Yape/Plin/Transf., POS o Crédito).', 'error');
      return;
    }
  }

  btnGuardarPedido.disabled = true;

  try {
    // 1. Crear o actualizar cliente (la dirección se maneja aparte, en direcciones_cliente)
    const datosCli = {
      telefono: cliTelefono.value.trim() || null,
      nombre_o_negocio: cliNombre.value.trim() || null,
      tipo: cliTipo.value || null,
      notas: cliNotas.value.trim() || null
    };

    let idCliente = clienteSeleccionadoId;

    if (idCliente) {
      const { error } = await sb.from('clientes').update(datosCli).eq('cliente_id', idCliente);
      if (error) throw error;
    } else {
      const { data, error } = await sb.from('clientes').insert(datosCli).select().single();
      if (error) throw error;
      idCliente = data.cliente_id;
    }

    // 2. Determinar qué dirección se usa para este pedido
    let direccionEntrega;
    if (esVentaEnCasa) {
      direccionEntrega = null;
    } else if (pedDireccion.value === '__historica__') {
      direccionEntrega = direccionEntregaOriginalEdicion;
    } else {
      const direccionElegida = direccionesClienteActual.find(d => d.direccion_id === pedDireccion.value);
      direccionEntrega = direccionElegida ? direccionElegida.direccion : null;
    }

    // 3. Si es venta de mostrador, subir las fotos de comprobante ahora
    if (esVentaEnCasa && inputComprobanteMostrador.files.length > 0) {
      for (const archivo of inputComprobanteMostrador.files) {
        const ruta = `mostrador_${Date.now()}_${archivo.name}`;
        const { error: errorSubida } = await sb.storage.from('comprobantes').upload(ruta, archivo);
        if (errorSubida) throw errorSubida;
        const { data: urlData } = sb.storage.from('comprobantes').getPublicUrl(ruta);
        comprobantesMostrador.push(urlData.publicUrl);
      }
    }

    // 4. Crear o actualizar pedido
    const datosPed = {
      cliente_id: idCliente,
      recepcionista: pedRecepcionista.value.trim(),
      cantidad: Number(pedCantidad.value),
      producto: pedProducto.value,
      precio: Number(pedPrecio.value),
      medio_pago_previsto: pedPago.value || null,
      origen_venta: pedOrigen.value,
      barrio_sector: pedBarrio.value,
      direccion_entrega: direccionEntrega,
      notas: pedNotas.value.trim() || null
    };

    if (esVentaEnCasa) {
      datosPed.estado = 'Entregado';
      datosPed.fecha_hora_entregado = new Date().toISOString();
      datosPed.medio_pago_real = { medios: mediosPagoMostrador, aclaracion: aclaracionMostrador.value.trim() || null };
      datosPed.voucher_fotos = comprobantesMostrador.length ? comprobantesMostrador : null;
    }

    let pedidoGuardado;

    if (pedidoEnEdicionId) {
      datosPed.ultima_edicion_por = pedRecepcionista.value.trim();
      datosPed.ultima_edicion_en = new Date().toISOString();
      const { data, error } = await sb
        .from('pedidos')
        .update(datosPed)
        .eq('pedido_id', pedidoEnEdicionId)
        .select()
        .single();
      if (error) throw error;
      pedidoGuardado = data;
      mostrarMensaje('Pedido actualizado.', 'ok');
    } else {
      const { data, error } = await sb.from('pedidos').insert(datosPed).select().single();
      if (error) throw error;
      pedidoGuardado = data;
      mostrarMensaje(esVentaEnCasa ? 'Venta de mostrador registrada como Entregado.' : 'Pedido guardado.', 'ok');
    }

    limpiarFormularioPedido();
    limpiarFormularioCliente();
    cargarPedidosRecientes();
  } catch (err) {
    mostrarMensaje('Error guardando: ' + err.message, 'error');
  } finally {
    btnGuardarPedido.disabled = false;
  }
}

// -------- Cancelar un pedido en estado "Creado" --------
el('btn-cancelar-pedido').addEventListener('click', cancelarPedido);

async function cancelarPedido() {
  const motivo = pedMotivoCancelacion.value;
  if (!motivo) { mostrarMensaje('Elige el motivo de la cancelación.', 'error'); return; }
  if (!confirm('¿Seguro que quieres marcar este pedido como Cancelado? Esta acción no se puede deshacer desde aquí.')) return;

  const { error } = await sb
    .from('pedidos')
    .update({
      estado: 'Cancelado',
      codigo_cancelacion: motivo,
      ultima_edicion_por: pedRecepcionista.value || 'Sin especificar',
      ultima_edicion_en: new Date().toISOString()
    })
    .eq('pedido_id', pedidoEnEdicionId);

  if (error) { mostrarMensaje('Error cancelando el pedido: ' + error.message, 'error'); return; }

  mostrarMensaje('Pedido marcado como Cancelado.', 'ok');
  limpiarFormularioPedido();
  limpiarFormularioCliente();
  cargarPedidosRecientes();
}

// -------- Tabla de pedidos recientes --------
async function cargarPedidosRecientes() {
  const { data, error } = await sb
    .from('pedidos')
    .select('*, clientes(nombre_o_negocio, telefono, tipo, notas, pin_lat, pin_lng), repartidores(nombre)')
    .order('fecha_hora_creado', { ascending: false })
    .limit(30);

  if (error) {
    cuerpoTabla.innerHTML = `<tr><td colspan="12">Error cargando pedidos: ${escaparHtml(error.message)}</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    cuerpoTabla.innerHTML = '<tr><td colspan="12">Todavía no hay pedidos.</td></tr>';
    return;
  }

  cuerpoTabla.innerHTML = data.map(p => `
    <tr>
      <td>${formatearFecha(p.fecha_hora_creado)}</td>
      <td>${escaparHtml(p.clientes?.nombre_o_negocio || p.clientes?.telefono || '—')}</td>
      <td>${escaparHtml(p.direccion_entrega || '—')}</td>
      <td>${escaparHtml(p.producto)}</td>
      <td>${p.cantidad}</td>
      <td>S/ ${Number(p.precio).toFixed(2)}</td>
      <td>${escaparHtml(p.origen_venta)}</td>
      <td>${escaparHtml(p.barrio_sector)}</td>
      <td><span class="pill ${p.estado}">${p.estado}</span></td>
      <td>${celdaRepartidor(p)}</td>
      <td>${escaparHtml(p.recepcionista)}</td>
      <td><button class="link-editar" data-id="${p.pedido_id}">Editar</button></td>
    </tr>
  `).join('');

  cuerpoTabla.querySelectorAll('button[data-id]').forEach(btn => {
    btn.addEventListener('click', () => cargarPedidoParaEditar(data.find(p => p.pedido_id === btn.dataset.id)));
  });

  cuerpoTabla.querySelectorAll('select[data-asignar]').forEach(select => {
    select.addEventListener('change', () => asignarRepartidor(select.dataset.asignar, select.value));
  });
}

const QUINCE_MINUTOS_MS = 15 * 60 * 1000;

function distanciaKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function celdaRepartidor(p) {
  if (p.estado === 'Creado') {
    const pinCliente = p.clientes?.pin_lat != null && p.clientes?.pin_lng != null ? p.clientes : null;
    const ahora = Date.now();

    const lista = repartidoresActivos.map(r => {
      const tieneUbicacionReciente = r.ultima_ubicacion_en &&
        (ahora - new Date(r.ultima_ubicacion_en).getTime()) < QUINCE_MINUTOS_MS &&
        r.ultima_lat != null && r.ultima_lng != null;

      const distancia = (pinCliente && tieneUbicacionReciente)
        ? distanciaKm(pinCliente.pin_lat, pinCliente.pin_lng, r.ultima_lat, r.ultima_lng)
        : null;

      return { ...r, distancia };
    });

    lista.sort((a, b) => {
      if (a.distancia == null && b.distancia == null) return a.nombre.localeCompare(b.nombre);
      if (a.distancia == null) return 1;
      if (b.distancia == null) return -1;
      return a.distancia - b.distancia;
    });

    const opciones = lista.map(r =>
      `<option value="${r.repartidor_id}">${escaparHtml(r.nombre)}${r.distancia != null ? ' — ' + r.distancia.toFixed(1) + ' km' : ''}</option>`
    ).join('');

    return `
      <select class="select-asignar" data-asignar="${p.pedido_id}">
        <option value="">— Asignar —</option>
        ${opciones}
      </select>
      ${!pinCliente ? '<div class="ayuda">Cliente sin ubicación guardada</div>' : ''}
    `;
  }
  return escaparHtml(p.repartidores?.nombre || '—');
}

async function asignarRepartidor(pedidoId, repartidorId) {
  if (!repartidorId) return;

  const { error } = await sb
    .from('pedidos')
    .update({
      repartidor_asignado_id: repartidorId,
      estado: 'Asignado',
      fecha_hora_asignado: new Date().toISOString()
    })
    .eq('pedido_id', pedidoId);

  if (error) { mostrarMensaje('Error asignando repartidor: ' + error.message, 'error'); return; }

  mostrarMensaje('Repartidor asignado.', 'ok');
  cargarPedidosRecientes();
}

async function cargarRepartidores() {
  const { data, error } = await sb
    .from('repartidores')
    .select('*')
    .eq('activo', true)
    .order('nombre');

  if (error) { mostrarMensaje('Error cargando repartidores: ' + error.message, 'error'); return; }
  repartidoresActivos = data || [];
}

// -------- Incidencias --------
async function cargarIncidencias() {
  const { data, error } = await sb
    .from('incidencias')
    .select('*, pedidos(producto, direccion_entrega)')
    .order('fecha_hora', { ascending: false })
    .limit(30);

  if (error) {
    listaIncidencias.innerHTML = `<p class="ayuda">Error cargando incidencias: ${escaparHtml(error.message)}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    listaIncidencias.innerHTML = '<p class="ayuda">No hay incidencias reportadas.</p>';
    return;
  }

  listaIncidencias.innerHTML = data.map(inc => `
    <div class="incidencia-item ${inc.estado === 'resuelta' ? 'incidencia-resuelta' : ''}" data-id="${inc.incidencia_id}">
      <div class="incidencia-meta">
        ${formatearFecha(inc.fecha_hora)} — reportado por ${escaparHtml(inc.reportado_por)}
        ${inc.pedidos ? ' — pedido: ' + escaparHtml(inc.pedidos.producto) + ' (' + escaparHtml(inc.pedidos.direccion_entrega || 'sin dirección') + ')' : ''}
      </div>
      <div class="incidencia-descripcion">${escaparHtml(inc.descripcion)}</div>
      ${inc.estado === 'resuelta'
        ? `<div class="incidencia-meta">✓ Resuelta por ${escaparHtml(inc.resuelto_por || '—')}: ${escaparHtml(inc.resolucion_aplicada || '')}</div>`
        : `
          <textarea class="texto-resolucion" rows="2" placeholder="¿Qué se hizo para resolverlo?"></textarea>
          <button type="button" class="secundario btn-resolver-incidencia" data-id="${inc.incidencia_id}">Marcar resuelta</button>
        `
      }
    </div>
  `).join('');

  listaIncidencias.querySelectorAll('.btn-resolver-incidencia').forEach(btn => {
    btn.addEventListener('click', () => {
      const contenedor = btn.closest('.incidencia-item');
      const texto = contenedor.querySelector('.texto-resolucion').value.trim();
      resolverIncidencia(btn.dataset.id, texto);
    });
  });
}

async function resolverIncidencia(incidenciaId, resolucion) {
  if (!resolucion) { mostrarMensaje('Escribe qué se hizo para resolverlo.', 'error'); return; }

  const { error } = await sb
    .from('incidencias')
    .update({
      estado: 'resuelta',
      resolucion_aplicada: resolucion,
      resuelto_por: pedRecepcionista.value || 'Sin especificar',
      resuelto_en: new Date().toISOString()
    })
    .eq('incidencia_id', incidenciaId);

  if (error) { mostrarMensaje('Error resolviendo incidencia: ' + error.message, 'error'); return; }

  mostrarMensaje('Incidencia marcada como resuelta.', 'ok');
  cargarIncidencias();
}

async function cargarPedidoParaEditar(p) {
  pedidoEnEdicionId = p.pedido_id;
  window.__estadoPedidoEnEdicion = p.estado;
  direccionEntregaOriginalEdicion = p.direccion_entrega || null;

  clienteSeleccionadoId = p.cliente_id;
  cliTelefono.value = p.clientes?.telefono || '';
  cliNombre.value = p.clientes?.nombre_o_negocio || '';
  cliTipo.value = p.clientes?.tipo || '';
  cliNotas.value = p.clientes?.notas || '';
  renderPinCliente(p.clientes);

  bannerCliente.textContent = p.estado === 'Creado'
    ? `✓ Editando pedido de ${p.clientes?.nombre_o_negocio || p.clientes?.telefono || 'cliente'} (estado: Creado — se puede editar todo)`
    : `⚠ Este pedido ya está en estado "${p.estado}". Solo se puede corregir el Barrio/Sector.`;
  bannerCliente.className = 'banner';

  await cargarDireccionesCliente(p.cliente_id);

  const direccionCoincide = direccionesClienteActual.find(d => d.direccion === p.direccion_entrega);
  if (direccionCoincide) {
    pedDireccion.value = direccionCoincide.direccion_id;
  } else if (p.direccion_entrega) {
    const opt = document.createElement('option');
    opt.value = '__historica__';
    opt.textContent = '(dirección original de este pedido) ' + p.direccion_entrega.slice(0, 60);
    pedDireccion.appendChild(opt);
    pedDireccion.value = '__historica__';
  }

  pedProducto.value = p.producto;
  pedCantidad.value = p.cantidad;
  pedPrecio.value = p.precio;
  pedPago.value = p.medio_pago_previsto || '';
  pedOrigen.value = p.origen_venta;
  pedBarrio.value = p.barrio_sector;
  pedRecepcionista.value = p.recepcionista;
  pedNotas.value = p.notas || '';

  habilitarCamposPedido(p.estado === 'Creado');
  btnGuardarPedido.textContent = p.estado === 'Creado' ? 'Guardar cambios' : 'Guardar barrio corregido';
  mostrar(btnCancelarEdicion);

  if (p.estado === 'Creado') {
    mostrar(bloqueCancelar);
  } else {
    ocultar(bloqueCancelar);
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// -------- Inicio --------
actualizarBannerCliente('nuevo');
renderDirecciones();
renderSelectDireccionPedido();
(async () => {
  await cargarRepartidores();
  cargarPedidosRecientes();
  cargarIncidencias();
})();

// Refresca la ubicación de los repartidores y la tabla cada minuto,
// para que la lista de "más cerca a más lejos" no se quede vieja.
setInterval(async () => {
  await cargarRepartidores();
  cargarPedidosRecientes();
}, 60000);
