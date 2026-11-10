# Impresoras de etiquetas (Zebra)

Las etiquetas de saca se imprimen en Zebras ZT421 de la planta Montalbos. Se
pueden dar de alta tantas como se quiera, siempre del mismo modelo y marca, y
al imprimir el usuario elige en cuál.

## Cómo llega el servidor a cada Zebra

La ZT421 solo admite IPP sobre TLS en el **631**. El servidor no ve la LAN de
planta: llega por el túnel WireGuard al PC de planta (`10.8.0.2`), que reenvía
**un puerto distinto por Zebra** a la IP de esa impresora con `portproxy`.

| Zebra            | IP en planta    | Puente en el PC de planta |
| ---------------- | --------------- | ------------------------- |
| Primera (actual) | `192.168.1.212` | `631 → 192.168.1.212:631` |
| Segunda          | `192.168.1.213` | `632 → 192.168.1.213:631` |
| …                | …               | `633`, `634`…             |

## Dar de alta una impresora nueva

1. **En planta** (informático o proveedor de Luvi2000): Zebra con IP fija y, en
   el PC de planta, PowerShell como administrador:

   ```powershell
   netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=<puerto> connectaddress=<IP de la Zebra> connectport=631
   Restart-Service iphlpsvc
   ```

   No hace falta tocar el firewall: la regla «WireGuard Luvi» ya deja pasar
   todo lo que llega por el túnel.

2. **En la app**: Configuración → Impresoras → «Nueva impresora», con el
   nombre, la IP de la Zebra y el puerto del puente. «Probar» manda una
   etiqueta de prueba.

No se pueden tener dos impresoras activas en el mismo puerto. Una impresora
desactivada deja de ofrecerse al imprimir.

## Al imprimir

- Con dos o más impresoras activas, al pulsar «Imprimir» se pregunta en cuál,
  con la última que usó ese usuario ya marcada.
- Con una sola, imprime directamente en ella.
- Sin ninguna dada de alta, se imprime con la configuración de entorno
  (`QR_PRINTER_IPP_URL` / `QR_PRINTER_IPP_URI`), que queda como respaldo.

El host del PC de planta se toma de `QR_PRINTER_BRIDGE_HOST` o, si no está,
del host de `QR_PRINTER_IPP_URL`.
