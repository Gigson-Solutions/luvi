# Luvi — Webapp de Logística para Luvi2000

Sistema de gestión logística para Luvi2000, empresa de procesado de plástico reciclado.

## Stack

- **Framework:** Next.js 16 (App Router) + TypeScript
- **ORM:** Prisma v7 + PostgreSQL (Neon)
- **Auth:** NextAuth v5 (credenciales, sin SSO)
- **UI:** Radix UI + Tailwind CSS v4
- **Forms:** React Hook Form + Zod
- **Charts:** Recharts
- **Deploy:** Vercel + Neon

## Setup

```bash
# Instalar dependencias
pnpm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# Generar cliente Prisma + migraciones
pnpm db:migrate

# Seed inicial (admin + datos de ejemplo)
pnpm db:seed

# Desarrollo
pnpm dev
```

## Módulos

| Módulo | Ruta | Descripción |
|--------|------|-------------|
| Recepciones | `/recepciones` | Registro de contenedores/camiones + pesaje Gestruck |
| Almacén | `/almacen` | Zonas, sacas, ocupación, traslados |
| Producción | `/produccion` | Transformaciones, lotes, tolva |
| Trazabilidad | `/trazabilidad` | Forward/backward + QR scan |
| Expediciones | `/expediciones` | Envíos, pallets retornables, albaranes Holded |
| Aprovisionamiento | `/aprovisionamiento` | POs, tránsito marítimo, tracking |
| Calidad | `/calidad` | Registros por lote, promedios por proveedor |
| Consumibles | `/consumibles` | Stock pallets, sacas vacías, capuchones |
| Incidencias | `/incidencias` | Gestión de incidencias con fotos |
| Dashboards | `/dashboards` | 5 dashboards KPI |
| Usuarios | `/usuarios` | Gestión de usuarios y roles |
| Configuración | `/configuracion` | Materiales, almacenes, zonas, umbrales |

## Roles

| Rol | Acceso |
|-----|--------|
| OPERARIO | Recepciones, Producción, Trazabilidad, Almacén (lectura) — móvil-first |
| ADMINISTRACIÓN | Expediciones, Consumibles, Aprovisionamiento |
| MANAGER | Todo excepto configuración de sistema |
| ADMIN | Acceso completo |

## Integraciones

- **Gestruck** — Básculas industriales (2 unidades). Fallback: entrada manual de peso.
- **Holded** — Solo generación de albaranes/facturas en expediciones confirmadas. La app es la única fuente de verdad del inventario.
- **Impresora etiquetas** — ZPL (Zebra) o equivalente. Pendiente confirmación de marca.

## Contacto cliente

Paula Pascual — Directora de Logística — trafico@luvi2000.org
