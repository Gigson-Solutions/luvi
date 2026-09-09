# Luvi — Contexto del Proyecto

## ¿Qué es esto?

Webapp de logística industrial para **Luvi2000**, empresa que procesa plástico reciclado 24/7. Reciben material en sacas (big bags), lo clasifican industrialmente y venden el output por kg/TM.

**Cliente:** Paula Pascual (Directora de Logística) — trafico@luvi2000.org
**Gestión interna:** Jaume Torres / Gigson Solutions

---

## Stack

| Capa            | Tecnología                               |
| --------------- | ---------------------------------------- |
| Framework       | Next.js 16 (App Router) + TypeScript     |
| ORM             | Prisma v7 + PostgreSQL (Neon serverless) |
| Auth            | NextAuth v5 + credenciales (sin SSO)     |
| UI              | Radix UI + Tailwind CSS v4               |
| Forms           | React Hook Form + Zod                    |
| Charts          | Recharts                                 |
| Package manager | pnpm                                     |
| Deploy          | **Autohospedado en Hetzner** (VPS único) |

---

## Naming — Decisiones validadas con cliente

⚠️ Respetar siempre este naming en código, UI, comentarios y variables:

| ❌ Evitar                     | ✅ Usar                                          |
| ----------------------------- | ------------------------------------------------ |
| Despachado                    | **Expedido**                                     |
| Lote de salida                | **Lote** (siempre con fecha de producción)       |
| Saca de salida                | **Producto Terminado / Subproducto / Rechazo**   |
| Transporte                    | **Aprovisionamiento** (para importaciones de MP) |
| Camiones pendientes de pesaje | **Contenedores/Camiones pendientes de recibir**  |

---

## Roles y permisos

```typescript
enum UserRole {
  OPERARIO        // Acceso reducido, móvil-first: recepciones, producción, trazabilidad, almacén (lectura)
  ADMINISTRACION  // Expediciones, consumibles, aprovisionamiento
  MANAGER         // Todo excepto configuración de sistema
  ADMIN           // Acceso completo
}
```

---

## Entidad central: Saca (Big Bag)

La saca es la entidad core del sistema. Tiene 10 estados:

```typescript
enum SackStatus {
  PENDIENTE_RECIBIR   // Registrada pero no pesada
  EN_ALMACEN          // Pesada, ubicada en zona
  EN_PRODUCCION       // Entrada en tolva confirmada
  PROCESADA           // Transformación completada
  PRODUCTO_TERMINADO  // Saca de salida tipo PT
  SUBPRODUCTO         // Saca de salida tipo subproducto
  RECHAZO             // Saca de salida tipo rechazo
  EN_TRANSITO         // En envío confirmado
  ENTREGADA           // Entrega confirmada
  BAJA                // Dada de baja manualmente
}
```

---

## Flujos clave

### Recepción (Módulo Recepciones)

1. Paula/Alejandro registran el contenedor previamente desde Valencia
2. Laura (planta Montalbos) pesa en Gestruck → app absorbe automáticamente
3. Laura añade campos post-pesaje: almacén destino, nº sacas, palés
4. Se generan sacas automáticamente con QRs → cola de impresión

**Importante:** No hay "sacas sin ubicar". El almacén destino se asigna siempre al registrar.

### Producción (Módulo Producción)

1. Operario escanea QR de saca → confirma entrada a tolva
2. Operario registra saca de salida: PT / Subproducto / Rechazo
3. Nº de lote se **autogenera** con formato `DDMMYY-nºcamión` (operario solo confirma)
4. Sacas PT se acumulan automáticamente en el lote
5. Subproductos/Rechazos crean lote manualmente (o se añaden a lote existente)

### Expedición (Módulo Expediciones)

1. Crear envío: comprador + lotes + transportista
2. Confirmar expedición → genera albarán en Holded automáticamente
3. Holded NO sincroniza inventario — la app es la única fuente de verdad

---

## Integraciones

### Gestruck (Básculas)

- 2 básculas industriales en planta Montalbos, ambas en el sistema Gestruck
  (Gesnet2 de Giropes) que corre en el PC de planta. Interlocutor: José Manuel,
  de **Básculas Romero** (el instalador).
  - **BÁSCULA** (puente, camión) → Recepciones. Se lee por **API REST**, con
    fallback a la BBDD si la API no responde.
  - **PLATAFORMA** (big bag) → Producción. La API no publica estas pesadas: se
    leen **directamente de la BBDD MySQL** de Gestruck.
- Fallback obligatorio: entrada manual de peso.
- Báscula pequeña: necesita reconfiguración protocolo SIGS para decimales.
- Detalle completo (red, dispositivos y limitaciones): `docs/basculas-gestruck.md`.

### Holded

- **Solo** para generar albaranes y facturas en expediciones confirmadas
- NO se sincroniza inventario (app = fuente de verdad)
- Pendiente confirmar con Paula si rol "Ventas" es solo-lectura en inventario

### Impresora etiquetas

- Probablemente Zebra (ZPL) — pendiente confirmación de marca
- La abstracción de cola de impresión debe ser extensible a otras marcas

---

## Infraestructura y Deploy (GL-25)

⚠️ **Decisión (jul 2026): NO usamos Vercel/Neon. Todo autohospedado en un único VPS Hetzner.**
Motivo: hay que llegar a las básculas **Gestruck** en la LAN de la planta por **VPN (WireGuard)**, y Vercel (serverless, IP dinámica) no puede formar parte de la VPN. Al hospedar la app en el mismo box que el hub WireGuard, alcanza la Gestruck **directo por el túnel, sin proxy**.

### Servidor

- **Hetzner VPS `luvi2000-erp`** — `178.104.136.83`, Ubuntu 24.04 LTS, 2 vCPU / 3.7 GB / 38 GB.
- Un solo box con todo: **Next.js + PostgreSQL local + WireGuard (hub) + Caddy (reverse proxy + TLS automático)**.
- PostgreSQL local → Prisma sin driver serverless/pooler. BBDD y credenciales en el propio servidor.

### Red / VPN (WireGuard)

```
Usuarios ──HTTPS──▶ Caddy ──▶ Next.js (localhost:3000) ──▶ PostgreSQL (local)
                                     │
                                     └── Gestruck ──▶ wg0 (túnel) ──▶ Planta Montalbos ──▶ básculas
```

- Hub `wg0` = **10.8.0.1/24**, puerto **UDP 51820**.
- Peer **planta Montalbos** = **10.8.0.2**, expone la LAN **192.168.1.0/24** (Gestruck en **192.168.1.200**).
- La app llama a la Gestruck por su IP de planta a través del túnel (ver `src/lib/integrations/gestruck.ts`).
- **Regla de oro:** si Gestruck falla o no está configurada → `{ manual: true }`, el operario mete el peso a mano. La báscula nunca bloquea la operativa.

### Firewall (ufw)

- Abiertos: **22/tcp** (SSH), **80+443/tcp** (Caddy), **51820/udp** (WireGuard). Todo lo demás denegado.

### Backups / operativa

- `pg_dump` nocturno → Hetzner Storage Box + snapshots del VPS. Restore documentado.
- Contrapartida asumida: VPS único = punto único de fallo.

> Los secretos (claves privadas WG, password de la BBDD, `GESTRUCK_API_KEY`) viven **solo en el servidor** (`/etc/wireguard/` y el `.env` de cada entorno en `/opt/luvi-prod` y `/opt/luvi-staging`), nunca en el repo.

### Entornos desplegados

| Entorno  | Directorio          | Servicio        | Puerto |
| -------- | ------------------- | --------------- | ------ |
| prod     | `/opt/luvi-prod`    | `luvi-prod`     | 3000   |
| staging  | `/opt/luvi-staging` | `luvi-staging`  | 3001   |

Deploy con `/root/deploy-luvi.sh` (hace `reset --hard origin/main`, instala,
migra, hace seed y compila) y después `systemctl restart <servicio>`.

---

## Convenciones de código

- Functional components únicamente, Server Components por defecto
- Path alias `@/*` apunta a `src/*`
- No usar `any` — tipos explícitos siempre
- Retornos de función con tipo explícito: `): React.JSX.Element`
- Conventional Commits: `feat:`, `fix:`, `chore:`, `refactor:`
- Server Actions para mutaciones (no API routes directas en formularios)
- Validación con Zod en Server Actions y API routes
- No hardcodear valores de negocio — configuración en DB (tabla `Config`)

---

## Comandos útiles

```bash
pnpm dev              # Desarrollo local
pnpm typecheck        # Verificar tipos TypeScript
pnpm lint             # ESLint
pnpm format           # Prettier
pnpm db:migrate       # Migraciones Prisma
pnpm db:seed          # Seed inicial
pnpm db:studio        # Prisma Studio (UI de BD)
```

---

## Agentes disponibles

Ver `.claude/agents/` para la lista completa de agentes especializados.
Usar Claude Flow v3 (Ruflo) para orquestación multi-agente en tareas complejas.
