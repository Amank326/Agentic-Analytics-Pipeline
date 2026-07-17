# Project Report: Store Sales Analysis Dashboard
**Academic Analytics Project Submission**
**Topic**: Store Sales Data Cleaning, Database Modeling, Exploratory Data Analysis & Dashboard Integration

---

## 1. Executive Summary
This project implements an end-to-end data analytics pipeline focused on retail store sales, profitability, and regional product trends. Starting from raw, uncleaned transactional records, the project uses a Python cleaning architecture to handle formatting errors, duplicates, and type mismatches. The cleaned dataset is exported to structural formats (CSV and formatted Excel sheets) and loaded into a MySQL database schema. We perform extensive Exploratory Data Analysis (EDA) in Python and present a blueprint for an interactive dashboard in Power BI, as well as a fully responsive live web-based application dashboard.

---

## 2. Dataset & Data Dictionary
The transaction table contains information about orders placed in a retail environment.

| Field Name | Data Type | Key Type | Description |
|---|---|---|---|
| `order_id` | INT | PRIMARY KEY | Unique identifier for each transaction order. |
| `order_date` | DATE | - | Date of order placement. |
| `customer_name`| VARCHAR | - | Customer identity tag. |
| `category` | VARCHAR | - | High-level product segment (Technology, Furniture, etc.). |
| `sub_category` | VARCHAR | - | Specific sub-segment (Phones, Tables, Paper, Binders, etc.). |
| `sales` | DECIMAL | - | Gross value of the order transaction in USD ($). |
| `profit` | DECIMAL | - | Net profit contribution in USD ($). Can be negative. |
| `quantity` | INT | - | Count of units ordered in the transaction. |
| `region` | VARCHAR | - | Geographical region of the transaction (East, West, etc.). |

---

## 3. Data Cleaning & Excel Workbook Generation (Python)
The transactional dataset is processed programmatically in Python:
- **Duplicate Removal**: Scans for exact replicas of transactions and removes redundant rows.
- **Field Cleaning**: Normalizes string representations (e.g. cleans raw currency prefixes like `$`) and converts columns to numeric.
- **Type Enforcements**: Casts data structure elements explicitly (`order_id` to INT, `order_date` to DATETIME, `sales` and `profit` to FLOAT, and `quantity` to INT).
- **Excel Output (`cleaned_store_sales.xlsx`)**: Generates a formatted multi-sheet Excel file:
  - **Sheet 1: "Store Sales Data"**: Formatted data grid with bold headers, thin cell borders, aligned dates, and currency formatting for numerical fields.
  - **Sheet 2: "KPI Summary"**: Dynamically aggregates metrics using Excel formulas:
    - Total Sales: `=SUM('Store Sales Data'!F2:F66)`
    - Total Profit: `=SUM('Store Sales Data'!G2:G66)`
    - Profit Margin: `=B4/B3` (Profit divided by Sales, formatted as a percentage)
    - Average Order Value: `=AVERAGE('Store Sales Data'!F2:F66)`

---

## 4. Database Schema & Business Intelligence Queries (MySQL)
The structural database design includes performance indexes and queries to extract actionable findings:

### DDL Schema definition & Indexes
```sql
CREATE DATABASE IF NOT EXISTS SalesDB;
USE SalesDB;

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
```

### Advanced Analytics SQL Queries
1. **Product Segment Financial Analysis** (Shows margins by category and sub-category):
   ```sql
   SELECT 
       category, sub_category,
       SUM(sales) AS total_sales, SUM(profit) AS total_profit,
       (SUM(profit) / SUM(sales)) * 100 AS profit_margin_percent
   FROM store_sales
   GROUP BY category, sub_category
   ORDER BY total_sales DESC;
   ```
2. **Monthly Sales Performance & Growth Growth** (Uses LAG window functions to evaluate month-over-month sales differences):
   ```sql
   SELECT 
       DATE_FORMAT(order_date, '%Y-%m') AS sales_month,
       SUM(sales) AS total_sales, SUM(profit) AS total_profit,
       COUNT(order_id) AS total_orders,
       SUM(sales) - LAG(SUM(sales), 1) OVER (ORDER BY DATE_FORMAT(order_date, '%Y-%m')) AS sales_month_over_month_diff
   FROM store_sales
   GROUP BY sales_month;
   ```
3. **Top 10 Most Profitable Customers** (Ranks customer segments using dense ranking):
   ```sql
   SELECT customer_name, SUM(sales) AS total_sales, SUM(profit) AS total_profit,
          DENSE_RANK() OVER (ORDER BY SUM(profit) DESC) as profitability_rank
   FROM store_sales
   GROUP BY customer_name
   ORDER BY profitability_rank ASC LIMIT 10;
   ```
4. **Regional Revenue Breakdown** (Uses CTE to display relative regional market share):
   ```sql
   WITH RegionSalesCTE AS (
       SELECT region, SUM(sales) AS regional_sales, SUM(profit) AS regional_profit
       FROM store_sales
       GROUP BY region
   )
   SELECT region, regional_sales, regional_profit,
          (regional_sales / (SELECT SUM(sales) FROM store_sales)) * 100 AS sales_contribution_percent,
          (regional_profit / (SELECT SUM(profit) FROM store_sales)) * 100 AS profit_contribution_percent
   FROM RegionSalesCTE
   ORDER BY regional_sales DESC;
   ```

---

## 5. Exploratory Data Analysis (EDA) Visualizations
The python pipeline generates three charts summarizing the dataset insights:
1. **Sales vs. Profit Scatter Plot (`sales_vs_profit_outliers.png`)**: Highlights profit margins against transaction sizes. Reference lines indicate outlier values (e.g. Sales > $800, Profit < $0 representing deficit transactions).
2. **Regional Performance Bar Chart (`sales_by_category_region.png`)**: Displays average transaction sizes across product categories and regions to trace location-specific purchasing demand.
3. **Monthly Financial Trends Line Chart (`monthly_financial_trends.png`)**: Tracks monthly totals of sales and profit, illustrating growth curves and period performance.

---

## 6. Interactive Power BI Dashboard Blueprint
An executive dashboard can be constructed in Power BI by importing the exported `cleaned_store_sales.csv` or linking directly to the MySQL database:

### Data Model & Measures
- **Connection**: Import `cleaned_store_sales.csv` using Get Data.
- **Measures (DAX)**:
  - `Total Sales = SUM(store_sales[sales])`
  - `Total Profit = SUM(store_sales[profit])`
  - `Profit Margin = DIVIDE([Total Profit], [Total Sales], 0)` (Format as %)
  - `Total Quantity = SUM(store_sales[quantity])`

### Canvas Visual Blueprint (Layout: 16:9 widescreen)
- **Top Ribbon (Slicers)**: Category, Region, Order Date.
- **KPI Row**: Three KPI Card visuals displaying `Total Sales`, `Total Profit`, and `Profit Margin (%)` respectively.
- **Visual 1: Sales & Profit by Category**: Clustered column chart showing sales (X-axis) and profit (Y-axis) values per category.
- **Visual 2: Sales and Profit Trends**: Line and clustered column chart showing Sales as columns and Profit as a line, tracked monthly.
- **Visual 3: Outliers Scatter Plot**: Sales (X-axis) vs. Profit (Y-axis) plotted by Customer Name, with warning bands indicating loss-making regions.
- **Visual 4: Regional Contribution**: Donut chart displaying relative share of Sales by Region.
