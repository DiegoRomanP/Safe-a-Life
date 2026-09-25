-- =========================
-- TIPOS DE SANGRE
-- =========================

CREATE TABLE tipos_sangre (
    id BIGSERIAL PRIMARY KEY,
    codigo VARCHAR(3) UNIQUE NOT NULL
);

-- =============================
-- TIPOS DE ESTAB. DE SALUD
-- =============================

CREATE TABLE tipos_establecimiento (
    id BIGSERIAL PRIMARY KEY,
    nombre VARCHAR(50) UNIQUE NOT NULL
);

-- =============================
-- ESTABLECIMIENTOS DE SALUD
-- =============================

CREATE TABLE establecimientos_salud (
    id BIGSERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    tipo_establecimiento_id BIGINT REFERENCES tipos_establecimiento(id),
    direccion VARCHAR(255),
    latitud DECIMAL(9,6),
    longitud DECIMAL(9,6),
    activo BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMPTZ DEFAULT NOW()
);

-- =========================
-- PERFILES DE USUARIO
-- =========================

CREATE TABLE usuarios (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre_completo VARCHAR(150) NOT NULL,
    telefono VARCHAR(20),
    rol VARCHAR(30) NOT NULL DEFAULT 'donante',
    fecha_creacion TIMESTAMPTZ DEFAULT NOW(),
    fecha_actualizacion TIMESTAMPTZ DEFAULT NOW()
);

-- =========================
-- DATOS DEL DONANTE
-- =========================

CREATE TABLE donantes (
    usuario_id UUID PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
    tipo_sangre_id BIGINT REFERENCES tipos_sangre(id),
    fecha_nacimiento DATE,
    latitud DECIMAL(9,6),
    longitud DECIMAL(9,6),
    disponible BOOLEAN DEFAULT TRUE,
    fecha_ultima_donacion DATE,
    fecha_creacion TIMESTAMPTZ DEFAULT NOW(),
    fecha_actualizacion TIMESTAMPTZ DEFAULT NOW()
);

-- =========================
-- SOLICITUDES DE SANGRE
-- =========================

CREATE TABLE solicitudes_sangre (
    id BIGSERIAL PRIMARY KEY,
    establecimiento_salud_id BIGINT REFERENCES establecimientos_salud(id),
    tipo_sangre_id BIGINT REFERENCES tipos_sangre(id),
    creado_por UUID REFERENCES usuarios(id),
    urgencia VARCHAR(20) NOT NULL,
    unidades_requeridas INTEGER NOT NULL CHECK (unidades_requeridas > 0),
    estado VARCHAR(30) NOT NULL DEFAULT 'abierta',
    observaciones TEXT,
    fecha_creacion TIMESTAMPTZ DEFAULT NOW(),
    fecha_expiracion TIMESTAMPTZ
);

-- =========================
-- RESPUESTAS DE DONANTES
-- =========================

CREATE TABLE respuestas_solicitudes (
    id BIGSERIAL PRIMARY KEY,
    solicitud_id BIGINT REFERENCES solicitudes_sangre(id) ON DELETE CASCADE,
    donante_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
    respuesta VARCHAR(30) NOT NULL,
    fecha_respuesta TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(solicitud_id, donante_id)
);

-- =========================
-- COMPATIBILIDAD SANGUINEA
-- =========================

CREATE TABLE compatibilidad_sanguinea (
    tipo_sangre_donante_id BIGINT REFERENCES tipos_sangre(id) ON DELETE CASCADE,
    tipo_sangre_receptor_id BIGINT REFERENCES tipos_sangre(id) ON DELETE CASCADE,
    PRIMARY KEY (
        tipo_sangre_donante_id,
        tipo_sangre_receptor_id
    )
);

-- =========================
-- DATOS INICIALES
-- =========================

INSERT INTO tipos_sangre (codigo) VALUES
('O-'),
('O+'),
('A-'),
('A+'),
('B-'),
('B+'),
('AB-'),
('AB+');