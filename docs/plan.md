# Plan: Proyecto Luvi — Webapp de Logística para Luvi2000

---

## Plan de proyecto para cliente — 4 semanas

| Semana | Entregable | Qué ve el cliente |
|--------|-----------|-------------------|
| **Semana 1** | Estructura base + Login + Recepciones | Login funcionando, registro de contenedores con pesaje (manual o Gestruck), generación de sacas con QR |
| **Semana 2** | Almacén + Producción + Trazabilidad | Vista de ocupación por zonas, flujo de tolva, lotes autogenerados (DDMMYY-nºcamión), escaneo QR |
| **Semana 3** | Expediciones + Aprovisionamiento + Consumibles | Envíos con albarán Holded, pallets retornables por cliente, control de stock |
| **Semana 4** | Calidad + Incidencias + Dashboards + Polish mobile | 5 dashboards KPI, registros de calidad por lote, vista simplificada móvil para operarios |

**Entrega final:** Semana 4 — versión funcional en producción (Vercel + Neon).

> *Las integraciones con Gestruck (básculas) e impresora de etiquetas están condicionadas a la validación técnica con José (Melder) — se realizan en paralelo durante las semanas 1-2.*

---

## Context

Luvi2000 procesa plástico reciclado 24/7. Reciben material en sacas (big bags), lo clasifican industrialmente y venden el output por kg/TM. Actualmente gestionan con Excel y sistemas no integrados. Se ha validado un prototipo funcional con la cliente (Paula Pascual, Directora de Logística) en sesiones de Discovery que incluyen feedback concreto sobre flujos, naming y UX.

**Estado actual:** Discovery finalizado. Falta validar API de Gestruck (básculas) e impresora de etiquetas. La propuesta económica se presenta antes del 9 de abril.

**Objetivo:** Crear el repositorio `https://github.com/Gigson-Solutions/luvi` con la estructura de `Awesomely-Group/project-structure` y migrar la lógica del prototipo (React+FastAPI+MongoDB → Next.js+Prisma+PostgreSQL), respetando todo el feedback recogido en las reuniones.

---

## Decisiones clave del Discovery (reuniones ReadAI)

### Naming validado con cliente
- "Despachado" → **"Expedido"** (no confundir con despacho de aduanas)
- "Lote de salida" → ambiguo; el lote siempre lleva **fecha de producción**, no de salida
- "Saca de salida" → **"Producto terminado"** / "Subproducto" / "Rechazo"
- Sección "Transporte" → renombrar a **"Aprovisionamiento"** (para importaciones de MP)
- "Camiones pendientes de pesaje" → **"Contenedores/Camiones pendientes de recibir"**

### Flujos clarificados
- **Entradas:** 90% son contenedores. Paula/Alejandro los registran previamente desde Valencia. Laura (planta Montalbos) los pesa en Gestruck → app absorbe datos automáticamente → Laura añade campos adicionales (almacén destino, nº sacas). **No hay "sacas sin ubicar"** — el almacén destino se asigna en el momento del registro.
- **Almacén:** Capacidad máxima por zona configurable. Vista de ocupación actual + proyección futura según entradas previstas.
- **Producción:** El nº de lote se **autogenera** (formato: DDMMYY-nºcamión). El operario solo confirma. Las sacas de PT van automáticamente al lote. Subproductos y rechazos crean lote manualmente.
- **Consumibles — pallets retornables:** Clientes que tienen pallets en fianza. Se registra por cliente cuántos tienen, cuántos devuelven (y en qué estado: OK/NOK). Se actualiza stock automáticamente en envíos.
- **Holded:** Solo se usa para generar albaranes y facturas. **No se sincroniza inventario** (la app es la única fuente de verdad). Holded tiene rol de solo lectura para inventario, confirmar con ellos.
- **Usuarios/Auth:** No hay SSO (Microsoft). Login por usuario + contraseña. Roles: OPERARIO (acceso reducido, móvil-first), ADMINISTRACIÓN, MANAGER, ADMIN.
- **Gestruck (básculas):** Pendiente de validar API. Hay 2 básculas. La báscula pequeña necesita reconfiguración de protocolo (SIGS) para leer decimales correctamente. Fallback: entrada manual de peso.
- **Impresora etiquetas:** Probablemente Brother o Zebra (lenguaje propietario ZPL, no PDF estándar). Pendiente de confirmación de marca. Experiencia previa con Zebra.
- **UX mobile:** Diseño de operario pendiente — será mucho más simple (4-5 botones máximo). Se diseña tras tener el flujo completo de escritorio validado.

---

## Stack técnico

| Capa | Tecnología | Justificación |
|------|-----------|---------------|
| Framework | Next.js 16 (App Router) + TypeScript | Consistencia con Awesomely |
| ORM | Prisma + PostgreSQL (Neon) | Reemplaza MongoDB del prototipo |
| Auth | NextAuth v5 + credenciales | Sin SSO (operarios sin Microsoft) |
| UI | Radix UI + Tailwind CSS v4 | Mismo que prototipo |
| Forms | React Hook Form + Zod | Mismo que prototipo |
| Charts | Recharts | Mismo que prototipo |
| QR | @yudiel/react-qr-scanner + qrcode.react | Mismo que prototipo |
| Package manager | pnpm | Estándar Awesomely |
| Deploy | Vercel + Neon | Estándar Awesomely |

**Tema visual:** "Industrial Zen" — Forest Green `#15803d` primary, Safety Yellow `#facc15` warnings, fuentes Manrope + Public Sans (del prototipo).

---

## Estructura del repositorio

Seguir exactamente `Awesomely-Group/project-structure`:

```
luvi/
├── .claude/
│   ├── CLAUDE.md                    # Contexto del proyecto
│   ├── settings.json                # Hooks: format + lint on save
│   ├── .mcp.json                    # Ruflo/Claude Flow v3
│   ├── agents/                      # 13 agentes (copiar de project-structure)
│   ├── commands/
│   ├── skills/
│   └── helpers/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── src/
│   ├── app/
│   │   ├── layout.tsx               # Root: fonts + providers
│   │   ├── globals.css              # Tailwind v4 + CSS vars Industrial Zen
│   │   ├── login/page.tsx
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   ├── gestruck/weight/route.ts    # Proxy báscula
│   │   │   ├── qr-print/route.ts           # Cola impresora
│   │   │   └── sync/holded/route.ts        # Cron albaranes
│   │   └── (dashboard)/
│   │       ├── layout.tsx           # Sidebar role-filtered
│   │       ├── recepciones/         # Entradas camiones/contenedores
│   │       ├── almacen/             # Almacenes, zonas, sacas, traslados
│   │       ├── produccion/          # Transformaciones + lotes
│   │       ├── trazabilidad/        # Forward/backward + QR scan
│   │       ├── expediciones/        # Envíos, pallets retornables
│   │       ├── aprovisionamiento/   # POs, transit tracking (antes "Transporte")
│   │       ├── calidad/             # Registros calidad por lote + promedio/proveedor
│   │       ├── consumibles/         # Pallets, sacas, capuchones + retornables
│   │       ├── incidencias/
│   │       ├── dashboards/          # 5 dashboards
│   │       ├── usuarios/
│   │       └── configuracion/
│   ├── components/
│   │   ├── ui/                      # Radix wrappers (reutilizar del prototipo)
│   │   ├── layout/                  # Sidebar, topbar, page-header
│   │   ├── charts/                  # Recharts wrappers
│   │   ├── qr/                      # Scanner + generator
│   │   ├── forms/                   # Formularios por dominio
│   │   └── shared/                  # TraceabilityChain, SackTimeline, AlertBanner
│   ├── lib/
│   │   ├── auth.ts                  # NextAuth v5 (copiar patrón erp-awesomely)
│   │   ├── prisma.ts                # Neon singleton (copiar erp-awesomely)
│   │   ├── utils.ts                 # cn(), formatKg(), formatDate()
│   │   ├── permissions.ts           # Matriz OPERARIO/ADMIN/MANAGER/ADMINISTRACION
│   │   ├── services/                # Business logic puro
│   │   │   ├── sack.service.ts
│   │   │   ├── lot.service.ts
│   │   │   ├── transformation.service.ts
│   │   │   ├── shipment.service.ts
│   │   │   ├── traceability.service.ts
│   │   │   ├── quality.service.ts
│   │   │   └── alert.service.ts
│   │   └── integrations/
│   │       ├── gestruck.ts          # API báscula (con fallback manual)
│   │       ├── holded.ts            # Solo albaranes/facturas
│   │       └── qr-printer.ts        # ZPL para Zebra (o adaptar por marca)
│   ├── types/
│   └── middleware.ts                # Auth + RBAC (copiar patrón erp-awesomely)
├── .env.example
├── next.config.ts
├── package.json (pnpm)
└── vercel.json                      # Cron jobs
```

---

## Estimación días/horas por feature

### Fase 0 — Setup y estructura (11h)
| Feature | Horas |
|---------|-------|
| Scaffold Next.js 16, pnpm, .claude/ desde project-structure | 3 |
| Tailwind v4 + Industrial Zen theme tokens | 2 |
| CI/CD GitHub Actions (typecheck + lint) | 2 |
| Neon PostgreSQL + Vercel setup | 2 |
| CLAUDE.md del proyecto | 2 |

### Fase 1 — Auth y foundation (55h)
| Feature | Horas |
|---------|-------|
| NextAuth v5 + credenciales (sin SSO) + roles | 5 |
| Middleware RBAC (4 roles) | 4 |
| Login page | 3 |
| Prisma schema completo (20+ modelos) | 12 |
| Migrations + seed (materiales, almacenes, zonas de ejemplo) | 4 |
| Sidebar con navegación role-filtered | 5 |
| Componentes UI base (Button, Badge, Table, Dialog, Form wrappers) | 12 |
| Skeleton/loading states por ruta | 3 |
| Audit log infrastructure | 4 |
| lib/utils.ts, lib/permissions.ts | 3 |

### Fase 2 — Módulo Recepciones (30h)
| Feature | Horas |
|---------|-------|
| Lista contenedores/camiones pendientes de recibir (filtros por fecha, zona) | 5 |
| Formulario registro previo (Paula/Alejandro desde Valencia) | 6 |
| Absorción automática desde Gestruck al llegar pesaje | 5 |
| Campos adicionales post-pesaje: almacén destino, nº sacas, palés | 4 |
| Generación automática de sacas + QRs al confirmar | 5 |
| Envío a cola de impresión (ZPL/PDF según impresora) | 5 |

### Fase 3 — Módulo Almacén e Inventario (30h)
| Feature | Horas |
|---------|-------|
| Gestión almacenes + zonas (CRUD con capacidad máxima) | 5 |
| Vista ocupación por zona: actual + proyectada (entradas previstas) | 7 |
| Listado sacas con filtros (estado, material, almacén, proveedor) | 5 |
| Detalle saca (lifecycle completo + movimientos) | 4 |
| Traslados entre almacenes (manual + via QR escaneo) | 5 |
| Movimientos manuales (corrección operativa) | 4 |

### Fase 4 — Módulo Producción y Lotes (32h)
| Feature | Horas |
|---------|-------|
| Registro entrada a tolva (confirmar saca vía QR) | 4 |
| Registro saca de salida: PT / Subproducto / Rechazo | 5 |
| Autogeneración número de lote (DDMMYY-nºcamión, confirmado por operario) | 4 |
| Lote PT: acumulación automática de sacas | 5 |
| Lote Subproductos/Rechazos: creación manual, búsqueda por lote para sustituir sacas | 5 |
| Historial de producción diaria/semanal | 5 |
| Reprocesos (rechazo → tolva) | 4 |

### Fase 5 — Módulo Trazabilidad (24h)
| Feature | Horas |
|---------|-------|
| Búsqueda por saca ID o QR scan | 4 |
| Trazabilidad hacia atrás (saca → camión → proveedor) | 6 |
| Trazabilidad hacia adelante (saca → lote → envío) | 6 |
| Componente visual de cadena de trazabilidad | 5 |
| Página QR scanner (funciona en desktop con/sin cámara + entrada manual) | 3 |

### Fase 6 — Módulo Expediciones (34h)
| Feature | Horas |
|---------|-------|
| Listado envíos con estado (Borrador / Confirmado / Expedido / Entregado) | 4 |
| Creación envío: comprador, lotes, transportista | 6 |
| Confirmación expedición → genera albarán en Holded | 6 |
| Pallets retornables: registro préstamo por cliente, devoluciones (OK/NOK) | 8 |
| Stock pallets con proyección retornables en fianza | 4 |
| Gestión compradores (CRUD) | 3 |
| Gestión transportistas (CRUD) | 3 |

### Fase 7 — Módulo Aprovisionamiento (antes Transporte) (28h)
| Feature | Horas |
|---------|-------|
| POs de compra a proveedor (nº toneladas pedidas, enviadas, recibidas) | 6 |
| Envío de proveedor: múltiples contenedores por Bill of Lading | 6 |
| Tracking estado (En tránsito marítimo → Valencia → Planta) con fechas estimadas | 5 |
| Generación automática de entrada pendiente al registrar envío | 4 |
| Confirmación recepción en planta → descuenta del PO → suma al stock | 4 |
| Vista pivot: stock actual + tránsito + comprado por material+proveedor | 3 |

### Fase 8 — Módulo Calidad (20h)
| Feature | Horas |
|---------|-------|
| Registro de calidad por lote (turno, tipo MP/PT) | 4 |
| Grid Excel-like de muestras (densidad, PVC, cola, multicapa, metal, otros) | 7 |
| Validación automática vs rangos configurables (OK/NOK) con override manual | 4 |
| Vista promedio por proveedor/material (histórico mensual) | 5 |

### Fase 9 — Módulo Consumibles (16h)
| Feature | Horas |
|---------|-------|
| Stock pallets, sacas vacías, capuchones | 3 |
| Registro compras + devoluciones (camión, matrícula, OK/NOK) | 5 |
| Alertas de stock mínimo (umbral configurable por unidades) | 3 |
| Descuento automático en expediciones | 3 |
| Historial semanal de consumo | 2 |

### Fase 10 — Módulo Incidencias (15h)
| Feature | Horas |
|---------|-------|
| Creación incidencia (foto, QR saca, descripción, almacén) | 5 |
| Usuario + fecha auto-asignados del sesión | 1 |
| Lifecycle: Abierta → En revisión → En proceso → Resuelta → Cerrada | 4 |
| Listado con filtros por mes/almacén (comparativa mensual) | 3 |
| Upload foto (Cloudflare R2 o similar) | 2 |

### Fase 11 — 5 Dashboards (40h)
| Dashboard | Horas |
|-----------|-------|
| Almacén (stock TN, sacas, ocupación por zona, packing lists activos) | 8 |
| Logística/Expediciones (TN expedidas, nº envíos, % cumplimiento, pendiente embarcar) | 8 |
| Producción (TN procesadas día/semana, rendimiento, nº sacas in/out, % reproceso) | 8 |
| Calidad (lotes OK/NOK, % rechazo, desviación media) | 7 |
| Aprovisionamiento (stock actual, consumo medio, cobertura días, pedidos en tránsito) | 7 |
| Componente date-range + filtros reutilizables | 2 |

### Fase 12 — Integraciones (34h)
| Feature | Horas |
|---------|-------|
| Cliente Gestruck API (lectura peso, 2 básculas, fallback manual) | 8 |
| Auto-fill peso en recepción + expedición | 3 |
| Cliente Holded (albarán on expedición confirmada) | 8 |
| Cron Vercel para sync Holded (solo albaranes, no inventario) | 3 |
| Cola impresión ZPL (Zebra) — adaptar si es otra marca | 8 |
| Trigger impresión desde creación de sacas y página QR | 4 |

### Fase 13 — Polish, mobile y hardening (38h)
| Feature | Horas |
|---------|-------|
| Vista OPERARIO mobile-first: 4-5 botones principales (QR scan, tolva, saca salida, traslado) | 12 |
| Responsive audit completo 15 pantallas en tablet/móvil | 6 |
| WCAG 2.1 AA: keyboard nav, ARIA, contraste | 5 |
| Error boundaries + páginas 404/500 | 2 |
| Degradación graceful si Gestruck o Holded fallan | 3 |
| Optimización queries Prisma + índices | 3 |
| Tests integración path crítico (auth, recepción, expedición) | 5 |
| README + .env.example | 2 |

---

## Resumen estimación total

| Fase | Horas |
|------|-------|
| 0 — Setup | 11 |
| 1 — Auth + Foundation | 55 |
| 2 — Recepciones | 30 |
| 3 — Almacén + Inventario | 30 |
| 4 — Producción + Lotes | 32 |
| 5 — Trazabilidad | 24 |
| 6 — Expediciones | 34 |
| 7 — Aprovisionamiento | 28 |
| 8 — Calidad | 20 |
| 9 — Consumibles | 16 |
| 10 — Incidencias | 15 |
| 11 — Dashboards (5) | 40 |
| 12 — Integraciones | 34 |
| 13 — Polish + Mobile + Tests | 38 |
| **TOTAL** | **407h** |

**Equivale a ~4-5 semanas** con 1 dev full-stack senior + PM (Victor) a tiempo parcial.
Con 2 devs en paralelo (Fases 2-11 son paralelizables): **~3 semanas** de desarrollo.

> ⚠️ **Incertidumbre en estimación:** ±15-20% según resultado de validación de API Gestruck e impresora etiquetas. Si Gestruck no tiene webhooks o la impresora requiere integración no estándar, suma 8-16h adicionales.

---

## Riesgos y dependencias

| Riesgo | Impacto | Mitigación |
|--------|---------|-----------|
| API Gestruck sin webhooks o con protocolo limitado | Alto | Fallback manual ya diseñado; validar antes del 9 de abril con José (informático) y Laura (planta) |
| Impresora etiquetas: marca/protocolo no confirmado | Medio | Diseñar abstracción de cola de impresión; ZPL para Zebra ya conocido |
| Holded: permisos de solo-lectura en inventario | Bajo | Paula confirmará con Holded si rol "Ventas" solo-lectura cubre esto |
| Reconfiguración protocolo SIGS báscula pequeña | Medio | Tarea de técnico de Melder, no bloquea desarrollo, sí bloquea QA final |

---

## Camino crítico (qué desbloquea qué)

1. **Prisma schema** → todo lo demás
2. **Auth + middleware RBAC** → acceso a todas las rutas
3. **Sidebar + layout dashboard** → todas las páginas
4. **Módulo Recepciones** → genera las sacas que usan Almacén, Producción y Expediciones
5. **Módulo Almacén** → Producción y Trazabilidad necesitan sacas ubicadas
6. **Gestruck API** → validar antes del 9 de abril para precio cerrado

---

## Verificación / Cómo testear

1. **Setup:** `pnpm dev` levanta sin errores; `pnpm typecheck` pasa; `pnpm lint` pasa
2. **Auth:** Login con credenciales; redirige según rol; middleware bloquea rutas no autorizadas
3. **Recepción E2E:** Registrar contenedor → simular pesaje Gestruck → generar sacas → imprimir QR (stub)
4. **Producción E2E:** Escanear QR saca → confirmar entrada tolva → crear saca PT → verificar lote autogenerado
5. **Expedición E2E:** Crear envío con lote → confirmar expedición → verificar albarán creado en Holded sandbox
6. **Trazabilidad:** Escanear QR saca de producto terminado → ver cadena completa hacia atrás (proveedor → camión → lote) y adelante (envío → comprador)
7. **Dashboards:** Verificar KPIs con datos de seed; filtros por fecha funcionan
8. **Mobile OPERARIO:** En móvil, vista simplificada con 4-5 acciones; QR scanner activa cámara

---

## Archivos críticos de referencia

- `erp-awesomely/prisma/schema.prisma` — Patrón Prisma+Neon+NextAuth a replicar
- `erp-awesomely/src/lib/auth.ts` — NextAuth v5 con credenciales (adaptar: sin SSO, con roles)
- `erp-awesomely/src/middleware.ts` — Auth middleware a extender con RBAC 4 roles
- `erp-awesomely/src/lib/prisma.ts` — Neon singleton (copiar verbatim)
- `project-structure/.claude/` — Todo el directorio .claude a copiar y adaptar
- `vicleoga/Luvi2000_Gigson/backend/server.py` — 75+ endpoints y 20+ modelos a migrar a TypeScript+Prisma
- `vicleoga/Luvi2000_Gigson/frontend/src/pages/` — 15 páginas a migrar a Next.js App Router

---

## Arquitectura de conectividad — Gestruck (báscula en red local)

### El problema

La báscula expone su API en `http://192.168.1.200:5050/api/v1/weighing/search` — una IP privada de red local en la planta de Montalbos. La webapp corre en Vercel (Internet). **Vercel nunca puede alcanzar esa IP directamente.**

### Opciones evaluadas

| Opción | Cómo funciona | Pros | Contras |
|--------|--------------|------|---------|
| **A — Cloudflare Tunnel (recomendada)** | Proceso `cloudflared` en la red local que expone la IP interna como URL pública HTTPS | Sin abrir puertos, sin VPN, HTTPS automático, gratuito, transparente para la app | Requiere instalar `cloudflared` en un PC de la planta (siempre encendido) |
| **B — Agente local (alternativa)** | Un proceso Node.js en un PC de la planta hace polling a Gestruck y publica en la app vía webhook | Sin VPN, sin infra adicional | Requiere mantener proceso Node corriendo 24/7 |
| **C — VPN Site-to-Site** | Túnel IPSec/WireGuard entre el router de Montalbos y un servidor VPS | Acceso total a la red local, muy robusto | Requiere router compatible + configuración de red en planta + coste de servidor VPS |
| **D — Fetch desde el navegador de Laura** | El browser de Laura (en la red local) llama a `192.168.1.200:5050` directamente | Zero infra | Solo funciona desde ese PC; CORS; no funciona desde Valencia ni móvil |

### Solución recomendada: VPN Site-to-Site con WireGuard

**Por qué WireGuard y no Cloudflare Tunnel:** Cloudflare tiene conflictos judiciales activos con LaLiga en España y puede tener caídas o bloqueos parciales durante partidos de fútbol. Para un sistema industrial 24/7, la fiabilidad es crítica.

**WireGuard** es un protocolo VPN moderno, rápido y de código abierto. La solución consiste en un VPS (servidor privado virtual) que actúa de punto de conexión permanente.

#### Arquitectura

```
[Gestruck 192.168.1.200:5050 — red local Montalbos]
        ↓ WireGuard (UDP 51820, conexión saliente)
[VPS — p.ej. Hetzner/DigitalOcean ~5€/mes]
  IP pública fija: 123.45.67.89
        ↓ reverse proxy (nginx/caddy)
[Vercel — /api/gestruck/weight]
        ↓
[Frontend Next.js]
```

#### Qué se necesita

| Componente | Detalle | Coste |
|-----------|---------|-------|
| **VPS** | 1 CPU / 1GB RAM — Hetzner CX11 o DigitalOcean Droplet | ~5€/mes |
| **Dominio/subdominio** | `gestruck.luvi2000.es` apunta a IP del VPS | Ya tenéis dominio |
| **WireGuard en VPS** | `apt install wireguard` — configuración 20 min | Gratis |
| **WireGuard en planta** | PC Windows con [WireGuard for Windows](https://www.wireguard.com/install/) | Gratis |
| **Nginx en VPS** | Reverse proxy HTTP → IP privada Gestruck | Gratis |

#### Setup paso a paso

**1. VPS (Gigson lo configura remotamente):**
```bash
# Instalar WireGuard + Nginx
apt install wireguard nginx certbot python3-certbot-nginx

# Generar claves VPS
wg genkey | tee /etc/wireguard/privatekey | wg pubkey > /etc/wireguard/publickey

# Config /etc/wireguard/wg0.conf
[Interface]
Address = 10.0.0.1/24
ListenPort = 51820
PrivateKey = <clave-privada-vps>

[Peer]  # PC planta Montalbos
PublicKey = <clave-publica-pc-planta>
AllowedIPs = 10.0.0.2/32
```

**2. PC planta Montalbos (José lo instala):**
- Descargar WireGuard for Windows (exe, 5 min)
- Importar fichero de configuración que Gigson le envía:
```ini
[Interface]
PrivateKey = <clave-privada-pc-planta>
Address = 10.0.0.2/24
DNS = 1.1.1.1

[Peer]  # VPS
PublicKey = <clave-publica-vps>
Endpoint = 123.45.67.89:51820
AllowedIPs = 10.0.0.1/32
PersistentKeepalive = 25
```
- Activar "Run on startup" en WireGuard Windows → conecta automáticamente

**3. Nginx en VPS (reverse proxy):**
```nginx
server {
    listen 443 ssl;
    server_name gestruck.luvi2000.es;

    location / {
        # Redirige a Gestruck a través del túnel VPN
        proxy_pass http://10.0.0.2:5050;
        proxy_set_header Host $host;
    }
}
```

**Resultado:** `GESTRUCK_API_URL=https://gestruck.luvi2000.es` en Vercel. Independiente de Cloudflare, operativo 24/7.

#### Fiabilidad y redundancia

- Si el PC de la planta se apaga → WireGuard se reconecta solo al arrancar
- Si el VPS tiene problemas → Luvi cae al fallback manual (ya implementado)
- `PersistentKeepalive = 25` mantiene el túnel activo aunque no haya tráfico
- El VPS puede tener SLA 99.9% (Hetzner, DigitalOcean)

### Cambios de código en el proxy

**Archivo:** `src/app/api/gestruck/weight/route.ts`

```diff
- const res = await fetch(`${gestruck_url}/scale/${scaleId}/weight`, {
+ const res = await fetch(`${gestruck_url}/api/v1/weighing/search`, {
    headers: { "ApiKey": gestruck_key ?? "" },
```

Schema de respuesta (`WeighingViewDto`) a confirmar con José via `http://192.168.1.200/swagger/index.html`.

### Variables de entorno

```env
GESTRUCK_API_URL="https://gestruck.luvi2000.es"
GESTRUCK_API_KEY="<ApiKey de producción — pedir a José>"

# Desarrollo local (en la misma red que la báscula):
# GESTRUCK_API_URL="http://192.168.1.200:5050"
```

### Lo que sabemos de la API Gestruck (Swagger demo: api.gesnet.giropes-solutions.com)

**Autenticación:** Header `ApiKey` requerido en todos los endpoints.

**Endpoints relevantes:**
- `GET /api/v1/weighing/search` — Búsqueda de pesajes con filtros: `StartDate`, `EndDate`, `Vehicle`, `DriverCode`, `OrderCode`, `Status`, `Page`, `Size`
- `POST /api/v1/externalweigher/addnetweighing/{identifier}/{code}` — Registrar pesaje neto desde sistema externo. **Retorna `WeighingViewDto`** — también puede usarse como webhook inverso.

**Schema de respuesta `WeighingViewDto`:** propiedades exactas pendientes de confirmar con José (el Swagger demo lo trunca).

### Estrategia de ingesta — dos modos

**Modo 1 — Pull/polling (implementar primero):**
```
Frontend Recepciones
  → polling cada 5s mientras hay contenedor pendiente de pesar
  → GET /api/gestruck/weight?vehicle=XX
  → proxy Next.js → GET /api/v1/weighing/search?Vehicle=XX&Status=Completed
  → mapear WeighingViewDto → { weight, weighedAt, scaleId }
  → autofill en formulario de recepción
```

**Modo 2 — Push/webhook (mejora futura si José puede configurarlo):**
```
Gestruck termina pesaje
  → POST https://luvi.vercel.app/api/gestruck/webhook
  → Server Action actualiza Container automáticamente
  → notificación en tiempo real al operador
```

### Pendiente de validar con José (técnico Melder)

1. **ApiKey** de producción (IP 192.168.1.200) — o si en red local no requiere auth
2. **Schema exacto** del `WeighingViewDto` — visitar `http://192.168.1.200/swagger/index.html`
3. **¿Puede Gestruck configurar un webhook** que haga POST a nuestra URL al terminar un pesaje?
4. **PC disponible** en la planta para el túnel Cloudflare (siempre encendido)

---

## Plan de scaffold inicial — Gigson-Solutions/luvi

> El repo ya existe vacío en GitHub. Se genera el scaffold completo y se hace push.

### Versiones exactas (de erp-awesomely)
```json
{
  "next": "16.2.1",
  "react": "19.2.4",
  "next-auth": "5.0.0-beta.30",
  "@prisma/client": "^7.6.0",
  "prisma": "^7.6.0",
  "@prisma/adapter-neon": "^7.6.0",
  "@neondatabase/serverless": "^1.0.2",
  "@auth/prisma-adapter": "^2.11.1",
  "tailwindcss": "^4",
  "@tailwindcss/postcss": "^4",
  "typescript": "^5"
}
```
Añadir para Luvi: `react-hook-form`, `zod`, `@hookform/resolvers`, `recharts`, `@radix-ui/*`, `@yudiel/react-qr-scanner`, `qrcode.react`, `lucide-react`, `date-fns`, `clsx`, `tailwind-merge`, `nextjs-toploader`

### Archivos a generar en el scaffold

**Raíz:**
- `package.json` — dependencias arriba, scripts: dev/build/start/lint/typecheck/format
- `next.config.ts` — config vacía tipada
- `tsconfig.json` — igual que project-structure (paths `@/*`)
- `postcss.config.mjs` — `@tailwindcss/postcss`
- `.env.example` — DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL, HOLDED_API_KEY, GESTRUCK_API_URL
- `vercel.json` — cron jobs: `{ "crons": [{ "path": "/api/sync/holded", "schedule": "0 * * * *" }] }`
- `.gitignore` — estándar Next.js
- `README.md` — descripción + setup básico

**`.claude/`** (copiar de project-structure y adaptar):
- `CLAUDE.md` — contexto específico de Luvi (stack, módulos, naming, roles, decisiones clave del Discovery)
- `settings.json` — igual que project-structure (deny .env, hooks PostToolUse format+lint)
- `.mcp.json` — ruflo@latest
- `agents/` — 13 agentes copiados verbatim (web-frontend-dev, backend-api-dev, coder, planner, researcher, reviewer, security-auditor, swarm-coordinator, system-architect, task-router, tester, ui-design-dev, cicd-engineer)

**`prisma/`:**
- `schema.prisma` — datasource postgresql + generator + modelos completos de Luvi:
  - Auth: User (con campo `role: UserRole`), Account, Session, VerificationToken
  - Enums: `UserRole` (OPERARIO, ADMINISTRACION, MANAGER, ADMIN), `SackStatus` (10 estados), `MaterialType`, `ShipmentStatus`, `LotType` (PT, SUBPRODUCTO, RECHAZO), `IncidentStatus`
  - Dominio: Supplier, Material, Warehouse, Zone, Container, Sack, ProductionLot, Transformation, TransformationInput, Shipment, ShipmentLot, PurchaseOrder, ProviderShipment, QualityRecord, Consumable, ConsumableMovement, Pallet, PalletMovement, Incident, AuditLog
- `seed.ts` — admin user + materiales ejemplo + almacenes/zonas + configuración

**`src/app/`:**
- `layout.tsx` — Manrope+PublicSans fonts, NextTopLoader verde `#15803d`, lang="es"
- `globals.css` — `@import "tailwindcss"` + `@theme inline` con tokens Industrial Zen:
  ```css
  --color-primary: #15803d;       /* Forest Green */
  --color-primary-hover: #166534;
  --color-warning: #facc15;       /* Safety Yellow */
  --color-sidebar-bg: #1c1917;
  --font-sans: var(--font-manrope);
  ```
- `login/page.tsx` — form usuario+contraseña con Server Action, tema Industrial Zen
- `(dashboard)/layout.tsx` — auth check + Sidebar role-filtered + main content
- `(dashboard)/page.tsx` — redirect a `/dashboards`
- Carpetas vacías con `page.tsx` stub para: `recepciones/`, `almacen/`, `produccion/`, `trazabilidad/`, `expediciones/`, `aprovisionamiento/`, `calidad/`, `consumibles/`, `incidencias/`, `dashboards/`, `usuarios/`, `configuracion/`
- `api/auth/[...nextauth]/route.ts`
- `api/gestruck/weight/route.ts` — stub con fallback manual
- `api/qr-print/route.ts` — stub cola impresión
- `api/sync/holded/route.ts` — stub cron

**`src/lib/`:**
- `prisma.ts` — Neon singleton (copiar verbatim de erp-awesomely)
- `auth.ts` — NextAuth v5 credentials provider (sin SSO, con roles en JWT)
- `auth.config.ts` — pages: { signIn: '/login' }
- `middleware.ts` — RBAC: OPERARIO solo accede a recepciones/produccion/trazabilidad/almacen; resto según rol
- `utils.ts` — `cn()`, `formatKg()` (con unidad kg/TM), `formatDate()` (locale es-ES)
- `permissions.ts` — matriz de acceso por rol a cada módulo

**`src/components/`:**
- `layout/sidebar.tsx` — navegación filtrada por rol, iconos Lucide, tema oscuro sidebar
- `layout/topbar.tsx` — breadcrumb + user avatar + logout
- `layout/page-header.tsx` — título + subtitle + actions slot
- `ui/button.tsx` — wrapper Radix/Tailwind
- `ui/badge.tsx` — estados de saca (colores semánticos)
- `ui/table.tsx` — wrapper tabla responsive
- `ui/dialog.tsx` — wrapper Radix Dialog
- `ui/input.tsx`, `ui/label.tsx`, `ui/select.tsx`, `ui/textarea.tsx`

**`src/types/`:**
- `index.ts` — re-exports de tipos Prisma + tipos extendidos con sesión

### Secuencia de acciones para el scaffold

1. Clonar repo `Gigson-Solutions/luvi` localmente
2. Crear toda la estructura de archivos con el contenido descrito
3. `git add . && git commit -m "feat: initial scaffold — Next.js 16 + Prisma + NextAuth v5 + Industrial Zen theme"`
4. `git push origin main`

> **No se ejecuta `pnpm install` ni `prisma generate`** — el scaffold es solo archivos fuente. El dev lo levanta en local con sus credenciales de Neon.

---

## Estimación con Claude Code

### Metodología de reducción

Claude Code acelera principalmente en tres vectores:
- **Scaffolding y boilerplate** (80-90% reducción): estructura de archivos, configuración, tipos TypeScript, Prisma schema desde modelos existentes
- **Migración de lógica** (50-70% reducción): traducir endpoints FastAPI → Server Actions, MongoDB → Prisma queries, con el prototipo como referencia directa
- **UI y componentes** (40-60% reducción): las 15 páginas del prototipo son referencia directa; Claude migra JSX y adapta a App Router

Las tareas que NO se aceleran significativamente:
- **Integración Gestruck** — protocolo desconocido, requiere iterar con hardware real
- **Integración impresora ZPL** — mismo motivo
- **QA y validación con cliente** — requiere presencia humana
- **Toma de decisiones de negocio** — ambigüedades que deben resolverse con Paula

### Estimación por fase con Claude Code

| Fase | Horas (senior solo) | Horas (con Claude) | Reducción | Motivo |
|------|---------------------|-------------------|-----------|--------|
| 0 — Setup + estructura | 11 | 3 | 73% | Scaffold, config, CI/CD completamente automatizable |
| 1 — Auth + Foundation | 55 | 18 | 67% | Schema desde modelos del prototipo; auth copiado de erp-awesomely |
| 2 — Recepciones | 30 | 12 | 60% | Página + API ya existe en prototipo; migración directa |
| 3 — Almacén + Inventario | 30 | 13 | 57% | Lógica clara; UI compleja requiere revisión manual |
| 4 — Producción + Lotes | 32 | 14 | 56% | Autogeneración de lotes tiene lógica de negocio a validar |
| 5 — Trazabilidad | 24 | 9 | 63% | Consultas Prisma complejas pero patrón claro |
| 6 — Expediciones | 34 | 14 | 59% | Pallets retornables: lógica nueva sin referencia en prototipo |
| 7 — Aprovisionamiento | 28 | 13 | 54% | Módulo nuevo (era básico en prototipo); más diseño requerido |
| 8 — Calidad | 20 | 8 | 60% | Grid Excel-like es componente complejo pero bien definido |
| 9 — Consumibles | 16 | 6 | 63% | CRUD + alertas; bien especificado |
| 10 — Incidencias | 15 | 6 | 60% | Upload fotos requiere integración Cloudflare R2 |
| 11 — Dashboards (5) | 40 | 16 | 60% | Recharts + queries, patrón repetible entre dashboards |
| 12 — Integraciones | 34 | 20 | 41% | Gestruck e impresora requieren validación con hardware; Claude ayuda en cliente HTTP y abstracción |
| 13 — Polish + Mobile + Tests | 38 | 18 | 53% | Tests automatizables; responsive requiere revisión manual |
| **TOTAL** | **407h** | **170h** | **~58%** | |

### Resumen ejecutivo

| Modalidad | Horas totales | Perfil | Timeline (1 dev) | Timeline (2 devs) |
|-----------|--------------|--------|-----------------|------------------|
| Senior solo | 407h | Full-stack senior | 10-12 semanas | 5-6 semanas |
| Claude Code | ~170h | 1 dev (junior/mid apto) | 4-5 semanas | 2-3 semanas |

> **Nota de honestidad:** La estimación "con Claude" asume que el dev sabe revisar el output de Claude críticamente, hace QA real de cada feature, y no acepta código sin entenderlo. Con un dev sin experiencia en el stack, añadir +20-30%.

### Qué aporta Claude en este proyecto concretamente

1. **Migración FastAPI → Next.js Server Actions** — Claude lee `server.py` (3789 líneas) y genera los route handlers equivalentes con tipos TypeScript correctos
2. **Prisma schema** — Con los 20+ modelos del prototipo como referencia, Claude genera el schema completo incluyendo relaciones, enums e índices
3. **Componentes UI** — Las 15 páginas del prototipo en React son referencia directa; Claude migra a App Router respetando el naming validado con Paula
4. **Tests** — Genera tests de integración para los paths críticos (auth, recepción, expedición) con fixtures del seed
5. **Repetición de patrones** — Una vez implementado el primer módulo (Recepciones), Claude aplica el mismo patrón a los 10 restantes con consistencia total

### Incertidumbre en estimación con Claude

±20% según:
- Si Gestruck expone una API REST bien documentada (−8h) o requiere reverse engineering de protocolo (+12h)
- Si la impresora es Zebra con ZPL estándar (−4h) o requiere driver propietario (+8h)
- Complejidad real del componente Grid de Calidad (±6h)
