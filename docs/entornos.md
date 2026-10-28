# Entornos y flujo de despliegue

Los dos entornos viven en el mismo VPS Hetzner (`luvi2000-erp`, `178.104.136.83`)
y están completamente separados: cada uno tiene su directorio, su servicio
systemd, su base de datos, su carpeta de uploads y su `AUTH_SECRET`.

## Mapa de entornos

| | **producción** | **staging** |
| --- | --- | --- |
| Rama | `main` | `staging` |
| Directorio | `/opt/luvi-prod` | `/opt/luvi-staging` |
| Servicio | `luvi-prod` | `luvi-staging` |
| Puerto | 3000 | 3001 |
| URL | https://luvi.178.104.136.83.nip.io | https://staging.luvi.178.104.136.83.nip.io |
| Base de datos | `luvi` | `luvi_staging` |
| Uploads | `/opt/luvi-uploads/prod` | `/opt/luvi-uploads/staging` |
| `.env` de origen | `/root/luvi.env` | `/root/luvi-staging.env` |

Caddy hace de reverse proxy y resuelve el TLS de los dos dominios.

## Una rama por entorno

- **`main` es producción.** Solo avanza desde `staging`, de forma explícita.
  Nunca se commitea directamente sobre ella.
- **`staging` es staging.** Es la rama de trabajo: las ramas de feature y de fix
  se mergean aquí, y lo que entra se prueba en staging.

`deploy-luvi.sh` deduce la rama del nombre del entorno (`prod` → `main`,
cualquier otro → la rama que se llama igual que el entorno), así que no hace
falta acordarse de pasarla y no es posible desplegar a producción algo que no
esté en `main`.

### Pull requests

La rama por defecto del repositorio sigue siendo `main`, así que al abrir un PR
GitHub propone `main` como base: **hay que cambiarla a `staging` siempre**.

- Las ramas de trabajo salen de `staging` y se mergean a `staging`.
- A `main` solo llegan la promoción desde `staging` y, excepcionalmente, las
  ramas `hotfix/*`.
- El workflow `.github/workflows/pr-base.yml` rechaza cualquier otro PR contra
  `main`, de modo que un despiste se ve en el propio PR y no en producción.

Con `gh`, pasando la base de forma explícita:

```bash
gh pr create --base staging
```

### Qué está pendiente de salir a producción

```bash
git fetch origin
git log --oneline origin/main..origin/staging
```

### Promocionar a producción

La promoción no se hace por PR: es un fast-forward local y un push.

```bash
git checkout main
git merge --ff-only staging
git push origin main
```

El `--ff-only` es intencionado: si falla, es que `main` tiene commits que
`staging` no tiene (normalmente un hotfix sin reintegrar) y hay que resolverlo
antes de seguir.

El push a `main` despliega producción solo (ver
[Deploy automático de producción](#deploy-automático-de-producción)).

## Desplegar

El script es el mismo para los dos entornos; cambian los argumentos:

```bash
# staging (despliega la rama staging)
ssh luvi
sudo /root/deploy-luvi.sh staging /opt/luvi-staging /root/luvi-staging.env \
  https://staging.luvi.178.104.136.83.nip.io 3001
sudo systemctl restart luvi-staging
```

```bash
# producción (despliega main)
ssh luvi
sudo /root/deploy-luvi.sh prod /opt/luvi-prod /root/luvi.env \
  https://luvi.178.104.136.83.nip.io 3000
sudo systemctl restart luvi-prod
```

El script hace `fetch` + `reset --hard` del ref correspondiente, regenera el
`.env` a partir del fichero de origen, instala, ejecuta `prisma migrate deploy`,
siembra y compila. Imprime el ref y el commit que despliega, y termina en
`DEPLOY OK (<ref>)`.

### Deploy automático de staging

**Staging se despliega solo.** `luvi-autodeploy-staging.timer` comprueba cada 5
minutos si la rama `staging` ha avanzado respecto a lo desplegado y, solo en ese
caso, lanza el deploy y reinicia el servicio. Si no hay novedad no hace nada ni
escribe en el log.

Es decir: al mergear un PR a `staging`, el cambio aparece en
https://staging.luvi.178.104.136.83.nip.io en unos minutos, sin tocar nada.
Lanzar el deploy a mano sigue funcionando y es la forma de no esperar.

```bash
# qué ha hecho el autodeploy
sudo journalctl -u luvi-autodeploy-staging.service -n 50

# pararlo temporalmente / volver a activarlo
sudo systemctl stop luvi-autodeploy-staging.timer
sudo systemctl start luvi-autodeploy-staging.timer
```

El script tiene el entorno fijado y no puede tocar `main` ni `/opt/luvi-prod`.

Un `flock` evita que dos ejecuciones del timer se solapen si un deploy tarda más
de 5 minutos. Un deploy lanzado a mano no toma ese lock, así que conviene no
ejecutarlo justo cuando salta el timer.

### Deploy automático de producción

**Producción se despliega al avanzar `main`.** El workflow
`.github/workflows/deploy-prod.yml` salta con cada push a `main` (la promoción
desde `staging`, un hotfix o un rollback) y lanza el deploy en el servidor. Si
falla, el run sale en rojo en la pestaña Actions de GitHub y llega el correo de
fallo.

El workflow no tiene shell en el servidor. Entra con una clave dedicada
(secret `PROD_DEPLOY_SSH_KEY`) que en `/root/.ssh/authorized_keys` está atada a
un único comando:

```
command="/root/luvi-deploy-prod-ci.sh",restrict ssh-ed25519 AAAA... github-actions-luvi-prod
```

`/root/luvi-deploy-prod-ci.sh` toma un `flock`, ejecuta `deploy-luvi.sh prod`,
reinicia `luvi-prod` y comprueba que responde en el puerto 3000. Ignora lo que
le pase el cliente: con esa clave solo se puede desplegar `main` en producción.

```bash
# relanzar el último deploy: Actions → "Deploy producción" → Re-run jobs

# cortar el deploy automático: borrar la línea de la clave en authorized_keys
# (o desactivar el workflow en GitHub). El deploy a mano sigue funcionando.
```

Un deploy a mano no toma el `flock` del workflow: conviene no lanzarlo mientras
haya un run de "Deploy producción" en marcha.

### Hotfix directo a producción

Un sexto argumento fuerza el ref. Se usa solo para urgencias, y el cambio se
reintegra después a `staging`:

```bash
sudo /root/deploy-luvi.sh prod /opt/luvi-prod /root/luvi.env \
  https://luvi.178.104.136.83.nip.io 3000 hotfix/lo-que-sea
```

### Rollback

Producción vuelve atrás moviendo `main` al commit anterior y desplegando:

```bash
git checkout main
git reset --hard <commit-bueno>
git push --force-with-lease origin main
```

El push dispara el deploy automático de producción, que despliega ese commit.

## Refrescar staging con los datos de producción

Staging solo sirve para validar si sus datos se parecen a los de producción: con
un catálogo de pruebas, un fallo que dependa de un material, una zona o un
comprador reales no aparece. **En datos manda siempre producción.**

```bash
ssh luvi
sudo /root/refresh-staging.sh --dry-run     # comprueba sin tocar nada
sudo /root/refresh-staging.sh --confirmar   # ejecuta el refresco
sudo /root/refresh-staging.sh --confirmar --sin-seed
```

Sin argumentos no hace nada: hay que pasar uno de los dos explícitamente.

El refresco restaura el último `pg_dump` de `luvi` sobre `luvi_staging`,
reejecuta el seed, recrea la cuenta de operario de pruebas y espeja los uploads.
**Nunca escribe en producción**: solo lee su dump.

### Lo que hay que saber antes de lanzarlo

- **Borra los datos actuales de staging.** Antes de tocar nada deja copia de la
  base de datos y de los uploads en `/root/backups-manual`, que queda fuera de
  la rotación de 14 días de `/root/backups`.
- **Restaura el backup nocturno de las 03:30**, así que staging queda hasta un
  día por detrás de producción. Para acercarlo, lanza `/root/backup-luvi.sh`
  justo antes.
- **Staging pasa a contener datos reales de negocio.** Mientras no esté
  confirmado que la clave de Holded de staging es de una cuenta de pruebas,
  conviene no confirmar expediciones allí: la confirmación genera albarán.

### La cuenta de operario de pruebas

En los datos de producción no hay ningún usuario con rol `OPERARIO`, y el seed
tampoco lo crea: usa `update: {}`, que no cambia el rol de un usuario que ya
existe. Sin esa cuenta no habría forma de probar el módulo de producción en
staging, así que el refresco la recrea en cada ejecución y la imprime al
terminar, junto a las demás cuentas de prueba que lista el seed.

## Lo que los dos entornos comparten

Separar las ramas no separa las integraciones. Hoy staging apunta a los mismos
sistemas físicos que producción:

- **Gestruck**: misma `GESTRUCK_API_KEY`, mismas credenciales de la BBDD MySQL y
  el mismo host (`10.8.0.2`, `gesnet2`). Es solo lectura, pero staging lee las
  pesadas reales de planta.
- **Impresora de etiquetas**: los dos entornos imprimen en
  `ipps://192.168.1.212:631`. Probar impresión en staging saca papel en
  Montalbos.
- **Holded**: las claves son distintas, pero ambas son claves reales. Conviene
  confirmar que la de staging es de una cuenta de pruebas antes de confirmar
  expediciones ahí, porque la confirmación genera albarán.

## Backups

`luvi-backup.timer` ejecuta `/root/backup-luvi.sh` cada noche a las 03:30 UTC:
`pg_dump -Fc` de `luvi` y `luvi_staging` en `/root/backups`, con retención de
14 días. **Las carpetas de uploads no entran en ese backup.**
