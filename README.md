# Save a Life

Plataforma web para conectar hospitales con donantes de sangre registrados, compatibles y cercanos, ante necesidades urgentes.

## Descripción

Save a Life permite que los hospitales publiquen necesidades de sangre y que el sistema notifique automáticamente a los donantes compatibles y cercanos por correo electrónico. El modelo es mediado por hospital: no existe contacto directo entre paciente y donante, lo que protege la privacidad de ambas partes.

## Características

- Registro de donantes con tipo de sangre (ABO/Rh), ubicación y disponibilidad.
- Panel de hospital para publicar y gestionar necesidades de sangre.
- Motor de compatibilidad que determina qué donantes pueden donar al tipo requerido.
- Filtro por cercanía mediante cálculo de distancia (fórmula de Haversine).
- Notificaciones por correo electrónico a los donantes compatibles.
- Confirmación de asistencia por parte del donante.

## Roles

| Rol | Función |
|-----|---------|
| Superadmin | Crea y gestiona hospitales y sus administradores. |
| Admin de hospital | Publica necesidades y visualiza donantes compatibles. |
| Donante | Registra su perfil y confirma su asistencia a donar. |

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | React + Vite + Tailwind CSS v4 |
| Backend | Node.js + Express |
| Base de datos | PostgreSQL (Supabase) |
| Autenticación | Supabase Auth |
| Correo electrónico | Resend |
| Geolocalización | Coordenadas + fórmula de Haversine |

## Estructura del proyecto

```
Save-a-Life/
├── frontend/      Aplicación React (Vite + Tailwind)
├── backend/       API REST (Express)
├── .gitignore
└── README.md
```

## Requisitos previos

- Node.js 18 o superior
- pnpm

## Instalación y ejecución

### 1. Clonar el repositorio

```bash
git clone <URL-del-repo>
cd Save-a-Life
```

### 2. Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

Disponible en `http://localhost:5173`.

### 3. Backend

```bash
cd backend
pnpm install
pnpm dev
```

Disponible en `http://localhost:3000`.

## Variables de entorno

Crear un archivo `.env` dentro de `backend/` con el siguiente contenido:

```
PORT=3000
SUPABASE_URL=tu_url_de_supabase
SUPABASE_KEY=tu_anon_key_de_supabase
```

El archivo `.env` no se versiona en el repositorio (está incluido en `.gitignore`).

## Estado del proyecto

En desarrollo — Sprint 0 (configuración e infraestructura inicial).

## Autores

Equipo Save a Life.

## Licencia

Ver archivo [LICENSE](LICENSE).