-- Fix: Two overloads of assign_coverage exist (one with uuid, one with integer p_shift_id).
-- PostgreSQL cannot choose between them. Drop the old uuid version, keep only integer.

DROP FUNCTION IF EXISTS assign_coverage(uuid, uuid, uuid);
