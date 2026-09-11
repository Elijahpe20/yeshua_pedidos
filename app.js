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

  // Validación básica
  if (!pedDireccion.value) { mostrarMensaje('Falta elegir la dirección de entrega.', 'error'); return; }
  if (!pedProducto.value) { mostrarMensaje('Falta elegir el producto.', 'error'); return; }
  if (!pedOrigen.value) { mostrarMensaje('Falta elegir el origen de la venta.', 'error'); return; }
  if (!pedPrecio.value) { mostrarMensaje('Falta el precio.', 'error'); return; }
  if (!pedRecepcionista.value.trim()) { mostrarMensaje('Falta indicar quién toma el pedido.', 'error'); return; }

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
    if (pedDireccion.value === '__historica__') {
      direccionEntrega = direccionEntregaOriginalEdicion;
    } else {
      const direccionElegida = direccionesClienteActual.find(d => d.direccion_id === pedDireccion.value);
      direccionEntrega = direccionElegida ? direccionElegida.direccion : null;
    }

    // 3. Crear o actualizar pedido
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
      mostrarMensaje('Pedido guardado.', 'ok');
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
    .select('*, clientes(nombre_o_negocio, telefono, tipo, notas)')
    .order('fecha_hora_creado', { ascending: false })
    .limit(30);

  if (error) {
    cuerpoTabla.innerHTML = `<tr><td colspan="11">Error cargando pedidos: ${escaparHtml(error.message)}</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    cuerpoTabla.innerHTML = '<tr><td colspan="11">Todavía no hay pedidos.</td></tr>';
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
      <td>${escaparHtml(p.recepcionista)}</td>
      <td><button class="link-editar" data-id="${p.pedido_id}">Editar</button></td>
    </tr>
  `).join('');

  cuerpoTabla.querySelectorAll('button[data-id]').forEach(btn => {
    btn.addEventListener('click', () => cargarPedidoParaEditar(data.find(p => p.pedido_id === btn.dataset.id)));
  });
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
cargarPedidosRecientes();
