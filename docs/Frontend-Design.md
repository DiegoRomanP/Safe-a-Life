# Diseño de interfaz del prototipo

## Propósito

Implementar como frontend navegable el sistema visual y los recorridos ya
representados en el archivo Penpot `Save_a_Life`. Esta es una adaptación al
contrato OpenAPI y al mock local; no agrega decisiones de producto ni implica que
autenticación, matching, email o permisos del mock sean productivos.

Referencia de diseño: `Save_a_Life`, seis páginas, 48 frames y 27 rutas. El
documento de explicación visual está en `~/Documentos/explicacion_penpont.txt`.

## Contrato visual

### Color

| Token | Valor | Uso |
| --- | --- | --- |
| `ink` | `#172B3A` | Texto principal y títulos |
| `petrol` | `#164E63` | Navegación y estructura institucional |
| `petrol-deep` | `#103B4B` | Rail de navegación en escritorio |
| `brand` | `#B4233C` | Acción primaria, con uso medido |
| `brand-deep` | `#8F1930` | Hover/active de la acción primaria |
| `canvas` | `#F6F8FA` | Fondo de trabajo |
| `surface` | `#FFFFFF` | Formularios y superficies de lectura |
| `muted` | `#526271` | Texto secundario |
| `line` | `#D9E0E5` | Bordes y divisores |
| `success` | `#166534` | Estado correcto, siempre con etiqueta textual |
| `warning` | `#854D0E` | Aviso informativo, siempre con etiqueta textual |
| `danger` | `#B91C1C` | Error o acción destructiva, siempre con texto |
| `focus` | `#0369A1` | Indicador de foco visible |

Los colores semánticos conservan contraste con su fondo y nunca son la única
señal del estado.

### Tipografía y forma

- Manrope Variable: navegación, controles, tablas y texto funcional, usando la
  fuente local ya fijada en el workspace.
- Newsreader Variable: títulos editoriales del acceso público y una sola
  jerarquía destacada por página; no usarla para datos/tablas.
- Escala de 4 px; radios discretos y consistentes; separadores finos; sin sombras
  pesadas, degradados de marca ni etiquetas decorativas en mayúsculas.
- No usar imaginería explícita de sangre ni datos que parezcan una recomendación
  clínica.

## Composición

### Vistas públicas y acceso

Una columna legible, cabecera institucional sencilla y formulario alineado a la
izquierda en escritorio; acciones apiladas en móvil. La entrada destaca el
propósito de coordinación entre hospitales y donantes. El selector de cuentas
está rotulado como modo local y ofrece únicamente perfiles sintéticos.

```text
+------------------------------------------------------+
| Save a Life                               Ingresar   |
|                                                      |
| Coordinación hospitalaria,                          |
| con intención de asistir                            |
| [Entrar al prototipo] [Conocer el flujo]              |
|                                                      |
| 3 roles de demo · datos sintéticos · Lima             |
+------------------------------------------------------+
```

### Vistas autenticadas

En escritorio, rail petróleo para navegación por rol, encabezado del área,
contenido en una columna principal y contexto/acciones secundarias a la derecha
solo cuando aporten. En móvil, cabecera compacta y navegación colapsable; ningún
contenido requiere desplazamiento horizontal.

```text
+------------------+-----------------------------------+
| Save a Life      | Hospital Demo       Modo local   |
| Resumen          |                                   |
| Necesidades      | Necesidad de donantes             |
| Respuestas       | Intenciones confirmadas: 2 de 5   |
|                  | [tabla/lista de estado]            |
| Datos sintéticos | Nota de verificación profesional  |
+------------------+-----------------------------------+
```

El rail mantiene el orden de navegación existente: donante (Invitaciones,
Mi perfil, Historial, Solicitudes), hospital (Resumen, Necesidades, Lotes,
Respuestas, Altas asistidas), superadmin (Tareas, Hospitales, Sedes,
Administradores, Solicitudes, Configuración, Auditoría).

## Comportamiento y contenido

- Respuestas afirmativas se denominan **intenciones de asistir**, no unidades,
  donaciones realizadas ni garantía de suficiencia.
- La compatibilidad declarada es preselección académica para RBC; verificación de
  grupo, elegibilidad y seguridad pertenecen al equipo clínico.
- Donantes solo ven su propio perfil e invitaciones. Hospital solo ve recursos de
  su institución y la proyección permitida. Superadmin no navega el padrón.
- Perfil donante solo ofrece disponibilidad y ubicación aproximada propia; no pide
  ni muestra historial/fecha de donación.
- El formulario de corrección solo permite seleccionar campos; al contrato de
  demo viajan placeholders sintéticos fijos y no editables. La API los valida y
  descarta, conservando únicamente etiquetas de campos/estado.
- En el estado inicial, la respuesta afirmativa puede mostrar al hospital nombre,
  grupo declarado, estado y hora. Al cambiar a rechazada, mostrar código opaco y
  estados, sin nombre ni grupo (AP-03).
- Cada formulario o acción contempla carga, vacío, error seguro, conflicto,
  permiso insuficiente, confirmación y reintento cuando aplique.
- Todas las acciones usan botones/enlaces semánticos, nombres claros, foco
  visible, orden de tabulación lógico, `aria-live` para resultados y respeto a
  `prefers-reduced-motion`. El foco usa azul/petróleo de alto contraste sobre
  superficies claras y blanco dentro del rail oscuro; la ruta activa se distingue con un indicador
  de borde de alto contraste.
- Objetivos de revisión responsive: 320, 360, 768, 1024 y 1440 px.

## Aceptación de la implementación

- El shell refleja el sistema visual anterior; los tres roles se diferencian por
  navegación y permisos observables del mock.
- Cada pantalla conserva lenguaje neutral, estados accesibles y datos claramente
  sintéticos.
- No se guardan sesión, tokens CSRF, MFA, grants ni datos personales en
  `localStorage` o `sessionStorage`; la sesión del mock usa cookie HttpOnly.
- No se agregan pantallas/operaciones que requieran resolver AP-02, AP-04, AP-06,
  AP-07 o AP-08.
