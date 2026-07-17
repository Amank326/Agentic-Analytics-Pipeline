-- =====================================================================
-- DATABASE CONFIGURATION: SalesDB (MySQL)
-- =====================================================================
CREATE DATABASE IF NOT EXISTS SalesDB;
USE SalesDB;

-- Create Table: store_sales
CREATE TABLE IF NOT EXISTS store_sales (
    order_id INT PRIMARY KEY,
    order_date DATE NOT NULL,
    customer_name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    sub_category VARCHAR(50) NOT NULL,
    sales DECIMAL(10, 2) NOT NULL,
    profit DECIMAL(10, 2) NOT NULL,
    quantity INT NOT NULL,
    region VARCHAR(50) NOT NULL
);

-- Optimize Performance using Database Indexes
CREATE INDEX idx_order_date ON store_sales(order_date);
CREATE INDEX idx_category_sub ON store_sales(category, sub_category);
CREATE INDEX idx_region ON store_sales(region);

-- =====================================================================
-- BUSINESS INTELLIGENCE & ANALYTICAL SQL QUERIES
-- =====================================================================

-- Query 1: Total Sales, Total Profit & Margin % by Category and Sub-Category
SELECT 
    category,
    sub_category,
    SUM(sales) AS total_sales,
    SUM(profit) AS total_profit,
    SUM(quantity) AS total_quantity,
    (SUM(profit) / SUM(sales)) * 100 AS profit_margin_percent
FROM 
    store_sales
GROUP BY 
    category, 
    sub_category
ORDER BY 
    total_sales DESC;

-- Query 2: Monthly Sales & Profit Growth Trends
SELECT 
    DATE_FORMAT(order_date, '%Y-%m') AS sales_month,
    SUM(sales) AS total_sales,
    SUM(profit) AS total_profit,
    COUNT(order_id) AS total_orders,
    SUM(sales) - LAG(SUM(sales), 1) OVER (ORDER BY DATE_FORMAT(order_date, '%Y-%m')) AS sales_month_over_month_diff
FROM 
    store_sales
GROUP BY 
    sales_month
ORDER BY 
    sales_month ASC;

-- Query 3: Advanced Customer Profitability Rankings (using DENSE_RANK Window Function)
SELECT 
    customer_name,
    SUM(sales) AS total_sales,
    SUM(profit) AS total_profit,
    DENSE_RANK() OVER (ORDER BY SUM(profit) DESC) as profitability_rank
FROM 
    store_sales
GROUP BY 
    customer_name
ORDER BY 
    profitability_rank ASC
LIMIT 10;

-- Query 4: Regional Contribution Analytics (using Common Table Expressions - CTEs)
WITH RegionSalesCTE AS (
    SELECT 
        region,
        SUM(sales) AS regional_sales,
        SUM(profit) AS regional_profit
    FROM 
        store_sales
    GROUP BY 
        region
)
SELECT 
    region,
    regional_sales,
    regional_profit,
    (regional_sales / (SELECT SUM(sales) FROM store_sales)) * 100 AS sales_contribution_percent,
    (regional_profit / (SELECT SUM(profit) FROM store_sales)) * 100 AS profit_contribution_percent
FROM 
    RegionSalesCTE
ORDER BY 
    regional_sales DESC;

-- Query 5: Sub-Category Profitability Analysis (Anomaly Detection)
SELECT 
    category,
    sub_category,
    AVG(sales) AS avg_sales_per_order,
    AVG(profit) AS avg_profit_per_order,
    SUM(CASE WHEN profit < 0 THEN 1 ELSE 0 END) AS negative_profit_orders_count,
    COUNT(order_id) AS total_orders
FROM 
    store_sales
GROUP BY 
    category, 
    sub_category
HAVING 
    avg_profit_per_order < 0 OR negative_profit_orders_count > 0
ORDER BY 
    negative_profit_orders_count DESC;
