---
name: save-a-life-domain
description: Modela requisitos, roles, estados y limites clinicos de Save a Life. Usar al definir epicas, historias, entidades, reglas de negocio, criterios de aceptacion o cambios en Save_a_Life.xlsx.
---

# Dominio de Save a Life

## Preparacion

1. Lee `.opencode/references/project-requirements.md`.
2. Identifica la historia del backlog y sus actores.
3. Enumera datos sensibles, permisos y estados afectados.
4. Separa hechos del Excel, decisiones aceptadas y supuestos pendientes.

## Invariantes

- El flujo siempre esta mediado por un hospital autorizado.
- Un donante solo consulta y modifica sus propios datos y respuestas.
- Un admin opera exclusivamente dentro de su hospital.
- Solo el superadmin administra hospitales y cuentas admin.
- Una necesidad cerrada o cancelada no admite nuevas confirmaciones.
- El matching produce candidatos, no elegibilidad medica.
- No se modelan pacientes, diagnosticos ni historia clinica.
- La compatibilidad se evalua donante a receptor y para un componente definido.

## Metodo de modelado

Para cada comportamiento produce:

1. Actor y objetivo.
2. Precondiciones y permisos.
3. Comando o evento.
4. Transicion de estado valida.
5. Resultado observable.
6. Errores y conflictos.
7. Evento auditable sin PII innecesaria.
8. Criterios de aceptacion y casos de abuso.

Prefiere estados explicitos a booleanos ambiguos. Mantiene separados necesidad,
invitacion y respuesta del donante para conservar trazabilidad.

## Limites de seguridad clinica

- Describe siempre la matriz ABO/Rh como regla de preseleccion del prototipo.
- No infieras intervalos de donacion, contraindicaciones ni aptitud del donante.
- No presentes cercania, probabilidad o compatibilidad como recomendacion medica.
- Marca toda regla clinica nueva como pendiente de fuente oficial y revision
  profesional antes de implementarla.

## Salida esperada

Entrega reglas, transiciones, permisos, aceptacion, casos limite y decisiones
abiertas. Si una decision abierta bloquea codigo irreversible, pregunta antes de
implementar.
