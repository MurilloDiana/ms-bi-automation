# Guía de Implementación — Expo Push Notifications
## App Móvil React Native ↔ ms-bi-automation

> **Contexto:** El backend ya está preparado. Esta guía cubre exclusivamente
> la parte de la app móvil: instalación, permisos, registro del token,
> escucha de notificaciones y navegación al tocar.

---

## Índice

1. [Prerequisitos](#1-prerequisitos)
2. [Instalación de dependencias](#2-instalación-de-dependencias)
3. [Configuración de app.json](#3-configuración-de-appjson)
4. [Canal de notificaciones Android](#4-canal-de-notificaciones-android)
5. [Servicio de notificaciones](#5-servicio-de-notificaciones-notificationservicejs)
6. [Integración en el flujo de login](#6-integración-en-el-flujo-de-login)
7. [Escuchar notificaciones en foreground](#7-escuchar-notificaciones-en-foreground)
8. [Navegar al tocar una notificación](#8-navegar-al-tocar-una-notificación)
9. [Desregistrar al cerrar sesión](#9-desregistrar-al-cerrar-sesión)
10. [Referencia de endpoints del backend](#10-referencia-de-endpoints-del-backend)
11. [Estructura del payload recibido](#11-estructura-del-payload-recibido)
12. [Probar sin dispositivo físico](#12-probar-sin-dispositivo-físico)
13. [Checklist de verificación](#13-checklist-de-verificación)

---

## 1. Prerequisitos

| Requisito | Detalle |
|-----------|---------|
| Expo SDK | 49 o superior |
| Dispositivo físico | Las notificaciones push **no funcionan en simuladores/emuladores** |
| ID del usuario logueado | Necesario para el endpoint de registro del token |
| URL del backend | La URL base de `ms-bi-automation` (ej: `https://mi-api.onrender.com/api/v1`) |

> **Expo Go en desarrollo:** Funciona con tokens `ExponentPushToken[...]`.
> En build de producción (EAS Build), el token cambia a formato
> `ExponentPushToken[...PRODUCTION...]` — el backend acepta ambos formatos.

---

## 2. Instalación de dependencias

```bash
npx expo install expo-notifications expo-device expo-constants
```

- **expo-notifications** — API principal para tokens, permisos y escucha
- **expo-device** — Detectar si es dispositivo físico (necesario antes de pedir token)
- **expo-constants** — Acceder al `projectId` de EAS

---

## 3. Configuración de `app.json`

Agregar la sección `plugins` y los permisos necesarios:

```json
{
  "expo": {
    "name": "BI Automation",
    "slug": "bi-automation",
    "version": "1.0.0",
    "plugins": [
      [
        "expo-notifications",
        {
          "icon": "./assets/notification-icon.png",
          "color": "#1f6feb",
          "sounds": [],
          "androidMode": "default",
          "androidCollapsedTitle": "BI Automation"
        }
      ]
    ],
    "android": {
      "permissions": ["RECEIVE_BOOT_COMPLETED", "VIBRATE"],
      "googleServicesFile": "./google-services.json"
    },
    "ios": {
      "bundleIdentifier": "com.tuempresa.biautomation",
      "infoPlist": {
        "UIBackgroundModes": ["remote-notification"]
      }
    }
  }
}
```

> `googleServicesFile` solo es necesario para builds con EAS. En Expo Go
> para desarrollo no hace falta.

---

## 4. Canal de notificaciones Android

Android 8+ requiere un **notification channel** definido antes de mostrar
notificaciones. Configurarlo una vez al arrancar la app (ej: en `App.js`
o en el `useEffect` del componente raíz):

```javascript
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Llamar una sola vez al iniciar la app
async function configurarCanalAndroid() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('mantenimiento', {
      name: 'Solicitudes de Mantenimiento',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1f6feb',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: false,
    });
  }
}
```

---

## 5. Servicio de notificaciones (`notificationService.js`)

Crear el archivo `src/services/notificationService.js` (o donde tu proyecto
organice los servicios):

```javascript
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const API_BASE_URL = 'https://tu-backend.onrender.com/api/v1'; // <-- cambiar

// Cómo mostrar la notificación cuando la app está en primer plano
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Solicita permisos y obtiene el Expo Push Token del dispositivo.
 * Retorna el token string o null si el usuario rechazó los permisos.
 */
export async function obtenerExpoPushToken() {
  if (!Device.isDevice) {
    console.warn('Las notificaciones push requieren un dispositivo físico.');
    return null;
  }

  const { status: statusActual } = await Notifications.getPermissionsAsync();
  let statusFinal = statusActual;

  if (statusActual !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    statusFinal = status;
  }

  if (statusFinal !== 'granted') {
    console.warn('Permisos de notificación denegados por el usuario.');
    return null;
  }

  // projectId: viene de app.json → expo.extra.eas.projectId (EAS Build)
  // En Expo Go se resuelve automáticamente
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  const tokenData = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined
  );

  return tokenData.data; // "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
}

/**
 * Registra el token en el backend asociándolo al usuario logueado.
 *
 * @param {string} usuarioId  - UUID del usuario en la BD (del estado de sesión)
 * @param {string} token      - ExponentPushToken[...] obtenido arriba
 */
export async function registrarTokenEnBackend(usuarioId, token) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/usuarios/${usuarioId}/push-token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }
    );
    const data = await response.json();
    if (!response.ok) {
      console.error('Error al registrar token push:', data);
      return false;
    }
    console.log('Token push registrado:', data.data?.id);
    return true;
  } catch (err) {
    console.error('Error de red al registrar token push:', err);
    return false;
  }
}

/**
 * Elimina el token del backend al cerrar sesión.
 * Evita que el usuario siga recibiendo notificaciones después del logout.
 *
 * @param {string} usuarioId  - UUID del usuario
 * @param {string} token      - Token a desregistrar
 */
export async function eliminarTokenDelBackend(usuarioId, token) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/usuarios/${usuarioId}/push-token`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      }
    );
    return response.ok;
  } catch (err) {
    console.error('Error al eliminar token push:', err);
    return false;
  }
}
```

---

## 6. Integración en el flujo de login

Después de que el login sea exitoso y tengas el `usuarioId` en el estado
de sesión, llamar en secuencia:

```javascript
import { obtenerExpoPushToken, registrarTokenEnBackend } from '../services/notificationService';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Dentro de tu función handleLogin, tras recibir respuesta exitosa del backend:
async function postLogin(usuario) {
  // 1. Guardar sesión normalmente
  await AsyncStorage.setItem('usuario', JSON.stringify(usuario));

  // 2. Registrar token push (no bloquear el flujo si falla)
  const token = await obtenerExpoPushToken();
  if (token) {
    await AsyncStorage.setItem('expoPushToken', token); // guardar para logout
    await registrarTokenEnBackend(usuario.id, token);
  }

  // 3. Navegar a Home
  navigation.replace('Home');
}
```

> **Por qué guardar el token en AsyncStorage:** Al hacer logout necesitas
> el mismo token para llamar al DELETE. Si el usuario reinicia la app
> antes de hacer logout, el token sigue disponible.

---

## 7. Escuchar notificaciones en foreground

Cuando la app está **abierta y visible**, Expo no muestra la notificación
automáticamente como banner del sistema — la intercepta y tú decides qué hacer.
El handler configurado en el paso 5 ya activa `shouldShowAlert: true`, pero
también puedes escuchar el evento para actualizar UI en tiempo real:

```javascript
import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';

// En tu componente raíz (App.js o el Navigator principal)
export default function App() {
  const notificacionListener = useRef();

  useEffect(() => {
    notificacionListener.current =
      Notifications.addNotificationReceivedListener(notificacion => {
        const { tipo, codigo, prioridad } = notificacion.request.content.data;

        if (tipo === 'NUEVA_SOLICITUD') {
          // Ejemplo: mostrar un badge, recargar la lista, mostrar un toast
          console.log(`Nueva solicitud recibida: ${codigo} — prioridad ${prioridad}`);
        }
      });

    return () => {
      Notifications.removeNotificationSubscription(notificacionListener.current);
    };
  }, []);

  // ...
}
```

---

## 8. Navegar al tocar una notificación

Este listener se dispara cuando el usuario **toca la notificación** (app en
background o cerrada). Úsalo para navegar a la pantalla de detalle:

```javascript
import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useNavigation } from '@react-navigation/native';

export default function App() {
  const navigation = useNavigation();
  const tapListener = useRef();

  useEffect(() => {
    // Manejar tap cuando la app ya estaba abierta o en background
    tapListener.current =
      Notifications.addNotificationResponseReceivedListener(response => {
        const data = response.notification.request.content.data;
        manejarNavegacion(data, navigation);
      });

    // Manejar tap que abrió la app desde estado cerrado
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (response) {
        manejarNavegacion(response.notification.request.content.data, navigation);
      }
    });

    return () => {
      Notifications.removeNotificationSubscription(tapListener.current);
    };
  }, []);
}

function manejarNavegacion(data, navigation) {
  if (!data?.tipo) return;

  switch (data.tipo) {
    case 'NUEVA_SOLICITUD':
      navigation.navigate('DetalleSolicitud', {
        solicitudId: data.solicitudId,
        codigo: data.codigo,
      });
      break;
    // Agregar más casos según los tipos que el backend defina en el futuro
    default:
      navigation.navigate('Solicitudes');
  }
}
```

---

## 9. Desregistrar al cerrar sesión

```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';
import { eliminarTokenDelBackend } from '../services/notificationService';

async function handleLogout(usuarioId) {
  // 1. Recuperar token guardado al login
  const token = await AsyncStorage.getItem('expoPushToken');

  // 2. Eliminar del backend antes de limpiar sesión local
  if (token && usuarioId) {
    await eliminarTokenDelBackend(usuarioId, token);
  }

  // 3. Limpiar almacenamiento local
  await AsyncStorage.multiRemove(['usuario', 'expoPushToken']);

  // 4. Navegar al login
  navigation.replace('Login');
}
```

---

## 10. Referencia de endpoints del backend

### Registrar token push
Llamar **una vez por sesión**, inmediatamente después del login exitoso.

```
POST /api/v1/usuarios/:usuarioId/push-token
```

| Campo | Valor |
|-------|-------|
| Method | `POST` |
| Content-Type | `application/json` |
| URL param `:usuarioId` | UUID del usuario logueado |

**Body:**
```json
{
  "token": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
}
```

**Respuesta exitosa `201`:**
```json
{
  "success": true,
  "data": {
    "id": 14,
    "usuario_id": "550e8400-e29b-41d4-a716-446655440000",
    "token": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
    "plataforma": "EXPO",
    "activo": true,
    "created_at": "2026-06-11T18:30:00.000Z"
  },
  "meta": "Token registrado"
}
```

**Respuesta error `400` (token con formato inválido):**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "token debe tener el formato ExponentPushToken[...]"
  }
}
```

---

### Eliminar token push (logout)
Llamar antes de limpiar la sesión local.

```
DELETE /api/v1/usuarios/:usuarioId/push-token
```

| Campo | Valor |
|-------|-------|
| Method | `DELETE` |
| Content-Type | `application/json` |
| URL param `:usuarioId` | UUID del usuario logueado |

**Body:**
```json
{
  "token": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
}
```

**Respuesta exitosa `200`:**
```json
{
  "success": true,
  "data": null,
  "meta": "Token eliminado"
}
```

**Respuesta `404` (token no encontrado o ya eliminado):**
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Token no encontrado"
  }
}
```

---

## 11. Estructura del payload recibido

Cuando el backend dispara la notificación al crear una nueva solicitud,
la app recibe este objeto en `notification.request.content`:

```javascript
{
  title: "🟡 Nueva solicitud de mantenimiento",   // icono según prioridad
  body: "SOL-2026-000042 — Falla en compresor de aire acondicionado sala...",
  data: {
    tipo: "NUEVA_SOLICITUD",          // string — para el switch de navegación
    solicitudId: "uuid-de-la-solicitud",
    codigo: "SOL-2026-000042",
    prioridad: "MEDIA"                // "BAJA" | "MEDIA" | "ALTA" | "CRITICA"
  }
}
```

**Iconos por prioridad** (prefijo en el título):

| Prioridad | Icono |
|-----------|-------|
| BAJA | 🔵 |
| MEDIA | 🟡 |
| ALTA | 🟠 |
| CRITICA | 🔴 |

---

## 12. Probar sin dispositivo físico

Puedes probar el envío desde la herramienta oficial de Expo mientras
desarrollas con Expo Go en un dispositivo físico:

1. Obtén tu token corriendo la app y logueando el valor con `console.log`
2. Ve a **[expo.dev/notifications](https://expo.dev/notifications)**
3. Pega el token en el campo "Expo Push Token"
4. Completa título, body y el campo **Data** con:
   ```json
   {
     "tipo": "NUEVA_SOLICITUD",
     "solicitudId": "550e8400-e29b-41d4-a716-446655440000",
     "codigo": "SOL-2026-TEST",
     "prioridad": "ALTA"
   }
   ```
5. Presiona "Send notification"

También puedes usar `curl` directamente contra la API de Expo:

```bash
curl -X POST https://exp.host/--/api/v2/push/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
    "title": "🟠 Nueva solicitud de mantenimiento",
    "body": "SOL-2026-TEST — Prueba de notificación",
    "data": {
      "tipo": "NUEVA_SOLICITUD",
      "solicitudId": "550e8400-e29b-41d4-a716-446655440000",
      "codigo": "SOL-2026-TEST",
      "prioridad": "ALTA"
    }
  }'
```

---

## 13. Checklist de verificación

Antes de considerar la feature completa, verificar cada punto:

- [ ] `expo-notifications`, `expo-device` y `expo-constants` instalados
- [ ] `app.json` tiene el plugin `expo-notifications` configurado
- [ ] Canal Android `mantenimiento` creado al iniciar la app
- [ ] `notificationService.js` creado con las tres funciones
- [ ] `postLogin()` llama a `obtenerExpoPushToken()` y a `registrarTokenEnBackend()`
- [ ] El token se almacena en `AsyncStorage` para el logout
- [ ] `handleLogout()` llama a `eliminarTokenDelBackend()` antes de limpiar sesión
- [ ] Listener de **notificación recibida** activo en el componente raíz
- [ ] Listener de **tap en notificación** navega a `DetalleSolicitud` con `solicitudId`
- [ ] `getLastNotificationResponseAsync()` cubre el caso "app cerrada → tap"
- [ ] Probado en dispositivo físico (iOS o Android)
- [ ] Probado con la app en foreground, background y cerrada

---

## Variables de entorno del backend relacionadas

Para referencia al configurar el entorno del servidor:

```env
# Opcional — mejora la entrega en producción pero no es obligatorio para dev
EXPO_ACCESS_TOKEN=

# Roles que reciben push al crearse una solicitud (separados por coma)
# Valores válidos: SUPERADMIN, GERENTE, TECNICO, ASISTENTE, OPERADOR
EXPO_PUSH_ROLES=SUPERADMIN,GERENTE,TECNICO
```

---

*Generado para ms-bi-automation — rama `feature/notificaciones-push`*
