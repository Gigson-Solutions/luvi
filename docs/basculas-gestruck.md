# Básculas Gestruck — conexión con el SGA

Documento de verificación y referencia: cómo obtiene la aplicación los pesajes de
las básculas de planta, qué red hace falta, desde qué dispositivos se puede pesar
y qué limitaciones tiene el acceso.

> Los secretos (clave de API, credenciales de la base de datos, claves de
> WireGuard) viven **solo** en el `.env` del servidor. No aparecen aquí ni en el
> repositorio.

---

## 1. Las dos básculas

| Báscula                       | Uso en la app                        | Dónde se lee el peso            |
| ----------------------------- | ------------------------------------ | ------------------------------- |
| **Puente / camión** (~45 TM)  | Recepciones — pesaje del camión      | API REST de Gestruck            |
| **Plataforma / big bag** (~1 TM) | Producción — peso de la saca de salida | Base de datos de Gestruck    |

Las dos están dadas de alta en el mismo sistema Gestruck (Gesnet2, de Giropes),
instalado por Básculas Romero, que corre en el **PC de planta de Laura**
(Montalbos). Ese PC es a la vez host del software de básculas y el punto por el
que la aplicación entra a los datos.

---

## 2. Cómo se conecta el SGA

```
Usuarios ──HTTPS──▶  Servidor Luvi (Hetzner)
                          │
                          ├── API REST  ──┐
                          │               ├──▶ túnel WireGuard ──▶ PC de planta ──▶ Gestruck
                          └── MySQL ──────┘
```

- **Camión (Recepciones):** la app llama a `GET /api/v1/weighing/search` de la
  API de Gestruck, filtrando por la matrícula del camión, y se queda con el
  pesaje **más reciente del día**. Autenticación por cabecera de API key.
- **Plataforma (Producción):** la API no publica las pesadas de big bag, así que
  la app las lee **directamente de la base de datos MySQL de Gestruck**
  (`gesnet2`), tomando la última pesada del dispositivo de plataforma.
- **Fallback del camión:** si la API no responde, la app intenta la misma lectura
  contra la base de datos antes de rendirse.

### Semántica importante (camión)

La app **no ordena pesar**: lee el pesaje que Gestruck ya ha registrado. Solo da
por bueno un pesaje **completo** (las dos pesadas hechas: con carga y sin carga).
Si el camión está a medias, la app lo detecta y avisa —"falta la pesada sin
carga"— en lugar de dar un peso incompleto.

---

## 3. Red y VPN requeridas

La planta de Montalbos **no tiene IP pública** (está detrás de NAT), así que no
se puede llamar a la báscula desde fuera. La conexión se resuelve con una **VPN
WireGuard**:

- El **servidor de Luvi** (Hetzner, con IP pública) actúa de concentrador de la
  VPN.
- El **PC de planta** es un cliente que **abre el túnel hacia el servidor** y lo
  mantiene vivo. No hace falta abrir ningún puerto en el router de la planta ni
  contratar IP fija.
- Dentro del túnel, el PC de planta tiene una dirección propia por la que la
  aplicación alcanza la API (puerto 5050) y la base de datos (puerto 3306).

Requisitos en el PC de planta para que la conexión funcione:

1. **Encendido y con el túnel activo.** Si el PC se apaga, no hay pesaje
   automático (la app sigue funcionando: peso a mano).
2. **Servicio de Gestruck arrancado**, escuchando en todas las interfaces (no
   solo en `localhost`).
3. **Regla de firewall de Windows** que permita el tráfico entrante desde la red
   de la VPN. El resto del equipo sigue protegido: solo el servidor de Luvi está
   en esa red.

> Esta decisión (VPN + servidor propio) es la que descartó el despliegue en
> servicios sin IP fija: sin dirección estable no se puede formar parte de la VPN
> de la planta.

---

## 4. Desde qué dispositivos se puede obtener el pesaje

El peso **no se lee desde el dispositivo del usuario**, sino desde el servidor de
la aplicación. Eso significa que:

- **Cualquier dispositivo con acceso a la app** (PC de oficina, portátil, móvil o
  tablet del operario, dentro o fuera de la planta) puede pulsar el botón de
  báscula y traer el peso, siempre que el servidor tenga el túnel levantado.
- **No hace falta** instalar nada en el móvil ni estar en la wifi de la planta.
- La **báscula física** sigue operándose igual que siempre desde su terminal; la
  app solo consulta el resultado.

Por rol, hoy:

- **Recepciones** (peso del camión): Laura y quien tenga acceso al módulo de
  recepciones.
- **Producción** (peso de la saca): el operario, desde el móvil.

---

## 5. Limitaciones de acceso conocidas

| Limitación                                                                     | Efecto                                                                        |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| El PC de planta debe estar encendido y con el túnel activo                      | Si está apagado, no hay pesaje automático → entrada manual                    |
| La plataforma (big bags) no se publica en la API, solo en la base de datos      | Se lee de la base de datos; depende de que el puerto MySQL sea accesible       |
| La API solo devuelve pesajes **cerrados** (dos pesadas)                         | Un camión a medias no da neto; la app lo avisa                                 |
| La red interna de la planta no es enrutable desde el servidor                   | Solo se alcanza el PC de planta, no otros equipos de la LAN                    |
| Matrículas concatenadas (tractora + remolque) en algunos pesajes                | Si la app guarda solo la tractora, la búsqueda por matrícula puede no casar    |
| La báscula pequeña no envía decimales con la configuración actual del protocolo | Pesos de big bag redondeados hasta que Básculas Romero la reconfigure          |

---

## 6. Regla de oro

**La báscula nunca bloquea la operativa.** Ante cualquier fallo —túnel caído, PC
apagado, servicio parado, pesaje incompleto— la aplicación devuelve el control al
usuario con un mensaje claro y el peso se introduce a mano. Ningún flujo de
recepción o de producción queda detenido por la báscula.

---

## 7. Comprobación rápida

Si el pesaje automático deja de funcionar, se revisa en este orden:

1. ¿Está encendido el PC de planta y activo el túnel?
2. ¿Está arrancado el servicio de Gestruck y responde en su puerto?
3. ¿Sigue puesta la regla de firewall para la red de la VPN?
4. ¿El pesaje del camión está cerrado (las dos pesadas)?

Mientras se resuelve, la entrada manual del peso sigue disponible en todos los
formularios.
