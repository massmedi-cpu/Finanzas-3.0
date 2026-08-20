CREATE TABLE cuentas (
 id TEXT PRIMARY KEY,
 nombre TEXT NOT NULL,
 entidad TEXT,
 tipo TEXT
);

CREATE TABLE movimientos_origen (
 id TEXT PRIMARY KEY,
 fecha DATE NOT NULL,
 cuenta_id TEXT,
 concepto TEXT,
 importe NUMERIC,
 saldo NUMERIC,
 origen TEXT NOT NULL
);

CREATE TABLE movimientos_enriquecidos (
 id TEXT PRIMARY KEY,
 movimiento_id TEXT NOT NULL,
 categoria TEXT,
 notas TEXT,
 revisado BOOLEAN DEFAULT FALSE
);
