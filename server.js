const express = require('express');
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, 'docs', 'gifts.json');
const gifts = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const isHttps = s => typeof s === 'string' && s.startsWith('https://');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'docs')));

app.get('/api/gifts', (req, res) => res.json(gifts));

// Adding is admin-only: the API URL is visible to everyone who opens the Mini App.
app.post('/api/gifts', (req, res) => {
  if (!process.env.ADMIN_TOKEN || req.get('x-admin-token') !== process.env.ADMIN_TOKEN) return res.sendStatus(401);

  const { id, name, model, backdrop, symbol, backdrop_colors, price, image, url, is_monochrome } = req.body ?? {};
  const isText = s => typeof s === 'string' && s.trim() !== '';
  if (!Number.isInteger(id) || id <= 0 || !isText(name) || !isText(model) || !isText(backdrop) || !isText(symbol)
    || !Array.isArray(backdrop_colors) || backdrop_colors.length !== 2 || !backdrop_colors.every(c => /^#[0-9a-f]{6}$/i.test(c))
    || typeof price !== 'number' || price < 0 || !isHttps(image) || !isHttps(url)) {
    return res.status(400).json({ error: 'Required: id (int > 0), name, model, backdrop, symbol, backdrop_colors (["#rrggbb","#rrggbb"]), price (>= 0), image and url (https://)' });
  }
  if (gifts.some(g => g.id === id && g.name === name)) return res.status(409).json({ error: 'Gift already exists' });

  const gift = {
    id, name: name.trim(), model: model.trim(), backdrop: backdrop.trim(), symbol: symbol.trim(), backdrop_colors,
    price, is_monochrome: is_monochrome === true, image, url,
  };
  gifts.push(gift);
  // shortcut: whole-file JSON rewrite, fine for a small catalog; move to SQLite/Postgres when it grows or gets concurrent writers.
  fs.writeFileSync(DATA, JSON.stringify(gifts, null, 2));
  res.status(201).json(gift);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Gift Finder: http://localhost:${PORT}`));
