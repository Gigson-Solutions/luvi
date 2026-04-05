# Luvi — Contexto del Proyecto

## ¿Qué es esto?

Webapp de logística industrial para **Luvi2000**, empresa que procesa plástico reciclado 24/7. Reciben material en sacas (big bags), lo clasifican industrialmente y venden el output por kg/TM.

**Cliente:** Paula Pascual (Directora de Logística) — trafico@luvi2000.org
**Gestión interna:** Jaume Torres / Gigson Solutions

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 16 (App Router) + TypeScript |
| ORM | Prisma v7 + PostgreSQL (Neon serverless) |
| Auth | NextAuth v5 + credenciales (sin SSO) |
| UI | Radix UI + Tailwind CSS v4 |
| Forms | React Hook Form + Zod |
| Charts | Recharts |
| Package manager | pnpm |
| Deploy | Vercel + Neon |

---

## Naming — Decisiones validadas con cliente

⚠️ Respetar siempre este naming en código, UI, comentarios y variables:

| ❌ Evitar | ✅ Usar |
|-----------|---------|
| Despachado | **Expedido** |
| Lote de salida | **Lote** (siempre con fecha de producción) |
| Saca de salida | **Producto Terminado / Subproducto / Rechazo** |
| Transporte | **Aprovisionamiento** (para importaciones de MP) |
| Camiones pendientes de pesaje | **Contenedores/Camiones pendientes de recibir** |

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
- 2 básculas industriales en planta Montalbos
- API pendiente de validar con José (informático Melder)
- Fallback obligatorio: entrada manual de peso
- Báscula pequeña: necesita reconfiguración protocolo SIGS para decimales

### Holded
- **Solo** para generar albaranes y facturas en expediciones confirmadas
- NO se sincroniza inventario (app = fuente de verdad)
- Pendiente confirmar con Paula si rol "Ventas" es solo-lectura en inventario

### Impresora etiquetas
- Probablemente Zebra (ZPL) — pendiente confirmación de marca
- La abstracción de cola de impresión debe ser extensible a otras marcas

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
