-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Companies Table
CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile TEXT,
    sectors TEXT[],
    states TEXT[],
    certifications TEXT[],
    turnover_year_1 NUMERIC,
    turnover_year_2 NUMERIC,
    turnover_year_3 NUMERIC,
    employee_count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Past Projects Table
CREATE TABLE IF NOT EXISTS past_projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    sector TEXT,
    value NUMERIC,
    year INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tenders Table
CREATE TABLE IF NOT EXISTS tenders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    source TEXT,
    sector TEXT,
    value NUMERIC,
    deadline TIMESTAMP WITH TIME ZONE,
    eligibility TEXT,
    certifications TEXT[],
    raw_text TEXT,
    confidence_score INTEGER, -- Out of 100
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Matches Table
CREATE TABLE IF NOT EXISTS matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tender_id UUID REFERENCES tenders(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    score_certifications INTEGER DEFAULT 0,
    score_sector INTEGER DEFAULT 0,
    score_financial INTEGER DEFAULT 0,
    score_geography INTEGER DEFAULT 0,
    score_past_projects INTEGER DEFAULT 0,
    overall_score INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tender_id, company_id)
);

-- Saved Tenders Table
CREATE TABLE IF NOT EXISTS saved_tenders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    tender_id UUID REFERENCES tenders(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(company_id, tender_id)
);

-- Applied Tenders Table
CREATE TABLE IF NOT EXISTS applied_tenders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    tender_id UUID REFERENCES tenders(id) ON DELETE CASCADE,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(company_id, tender_id)
);

-- Review Queue Table
CREATE TABLE IF NOT EXISTS review_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tender_raw_text TEXT NOT NULL,
    missing_fields TEXT[],
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ingestion Logs Table
CREATE TABLE IF NOT EXISTS ingestion_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source TEXT NOT NULL,
    status TEXT CHECK (status IN ('success', 'failure')),
    error_message TEXT,
    ingested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
