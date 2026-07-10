-- Migration: 001_extensions.sql
-- Habilita las extensiones PostgreSQL requeridas por el sistema

-- UUIDs como clave primaria por defecto
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Programación de jobs SQL directamente en PostgreSQL (TTL de reservas)
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- Funciones de cifrado adicionales (opcional, para auditoría)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
