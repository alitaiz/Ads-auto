// backend/routes/listings.js
import express from 'express';
import pool from '../db.js';

const router = express.Router();

// GET /api/listings - Fetch all product listings
router.get('/listings', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM product_listings ORDER BY asin ASC');
        res.json(rows);
    } catch (error) {
        console.error('Failed to fetch listings:', error);
        res.status(500).json({ error: 'Failed to fetch product listings.' });
    }
});

// POST /api/listings - Create a new product listing
router.post('/listings', async (req, res) => {
    const { asin, sku, title } = req.body;
    if (!asin || !sku) {
        return res.status(400).json({ error: 'ASIN and SKU are required.' });
    }
    try {
        const { rows } = await pool.query(
            'INSERT INTO product_listings (asin, sku, title) VALUES ($1, $2, $3) RETURNING *',
            [asin, sku, title]
        );
        res.status(201).json(rows[0]);
    } catch (error) {
        console.error('Failed to create listing:', error);
        if (error.code === '23505') { // unique_violation
            return res.status(409).json({ error: 'A listing with this ASIN already exists.' });
        }
        res.status(500).json({ error: 'Failed to create product listing.' });
    }
});

// PUT /api/listings/:id - Update an existing product listing
router.put('/listings/:id', async (req, res) => {
    const { id } = req.params;
    const { asin, sku, title } = req.body;
    if (!asin || !sku) {
        return res.status(400).json({ error: 'ASIN and SKU are required.' });
    }
    try {
        const { rows } = await pool.query(
            'UPDATE product_listings SET asin = $1, sku = $2, title = $3 WHERE id = $4 RETURNING *',
            [asin, sku, title, id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Listing not found.' });
        }
        res.json(rows[0]);
    } catch (error) {
        console.error(`Failed to update listing ${id}:`, error);
        if (error.code === '23505') { // unique_violation
            return res.status(409).json({ error: 'Another listing with this ASIN already exists.' });
        }
        res.status(500).json({ error: 'Failed to update product listing.' });
    }
});

// DELETE /api/listings/:id - Delete a product listing
router.delete('/listings/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM product_listings WHERE id = $1', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Listing not found.' });
        }
        res.status(204).send(); // Success, No Content
    } catch (error) {
        console.error(`Failed to delete listing ${id}:`, error);
        res.status(500).json({ error: 'Failed to delete product listing.' });
    }
});


export default router;