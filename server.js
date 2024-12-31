const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise'); 
const multer = require('multer');
require('dotenv').config();
const bcrypt = require('bcrypt');


const app = express();
app.use(express.json());
app.use(bodyParser.json());

const port = process.env.PORT || 26689;

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  port: process.env.MYSQL_PORT,
  waitForConnections: true,
  connectionLimit: 200,
  queueLimit: 0
});

async function checkDbConnection() {
  try {
    const connection = await pool.getConnection();
    console.log("Connected to the MySQL database successfully!");
    connection.release();  
  } catch (error) {
    console.error("Failed to connect to the MySQL database:", error.message);
  }
}

checkDbConnection();

const allowedOrigins = [
  'http://localhost:3000',
  'https://dangooenterprises.vercel.app',
  'https://dangooenterprisesbackend.vercel.app'
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: 'GET,POST,PUT,DELETE',
  allowedHeaders: 'Content-Type,Authorization'
};

app.use(cors(corsOptions));

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB file size limit
  fileFilter: (req, file, cb) => {
    const allowedImageFormats = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedImageFormats.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only jpeg, jpg, png, or webp are allowed.'), false);
    }
  }
});

app.post('/signup', async (req, res) => {
  const { email, password, confirmPassword } = req.body;

  if (password !== confirmPassword) {
    return res.status(400).json({ success: false, message: 'Passwords do not match' });
  }

  try {
    const connection = await pool.getConnection();
    try {

      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      const sql = 'INSERT INTO signup (email, password) VALUES (?, ?)';
      await connection.query(sql, [email, hashedPassword]);
      connection.release();
      return res.json({ success: true, message: 'Registration successful' });
    } catch (err) {
      connection.release();
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ success: false, message: 'Email already exists' });
      }
      console.error('Database error: ' + err.message);
      return res.status(500).json({ success: false, message: 'Registration failed' });
    }
  } catch (error) {
    console.error('Error: ' + error.message);
    return res.status(500).json({ success: false, message: 'Registration failed' });
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const connection = await pool.getConnection();
    const sql = 'SELECT * FROM signup WHERE email = ?';
    const [results] = await connection.query(sql, [email]);
    connection.release();

    if (results.length > 0) {
      const user = results[0];

     
      const passwordMatch = await bcrypt.compare(password, user.password);

      if (passwordMatch) {
        return res.json({
          success: true,
          message: 'Login successful',
          user: { id: user.id, email: user.email }
        });
      } else {
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
      }
    } else {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
  } catch (error) {
    console.error('Login error:', error.message);
    return res.status(500).json({ success: false, message: 'Login failed' });
  }
});


app.post('/loginadmin', async (req, res) => {
  const { email, password } = req.body;

  try {
    const connection = await pool.getConnection();
    const sql = 'SELECT * FROM users WHERE email = ?';
    const [results] = await connection.query(sql, [email]);
    connection.release();

    if (results.length > 0) {
      const user = results[0];

    
      if (password === user.password) {
        return res.json({
          success: true,
          message: 'Login successful',
          user: { id: user.id, email: user.email }
        });
      } else {
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
      }
    } else {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
  } catch (error) {
    console.error('Admin login error:', error.message);
    return res.status(500).json({ success: false, message: 'Admin login failed' });
  }
});


app.post('/cart/add', async (req, res) => {
  const { user_id, item_id, quantity, total_price } = req.body;

  console.log('Incoming request to add to cart:', { user_id, item_id, quantity, total_price });

  if (!user_id || !item_id || !quantity || total_price == null) {  // Ensure total_price is not null
    console.error('Missing required fields:', { user_id, item_id, quantity, total_price });
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  try {
    const connection = await pool.getConnection();
    
    const [productResults] = await connection.query(`
      SELECT p.title, p.description, p.price, pi.image 
      FROM products p 
      LEFT JOIN product_images pi ON p.id = pi.product_id 
      WHERE p.id = ?
    `, [item_id]);

    console.log('Product results:', productResults);

    if (productResults.length === 0) {
      connection.release();
      console.error('Product not found for item_id:', item_id);
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const product = productResults[0];

    if (!product.image) {
      console.error('No image found for product:', product);
    }

    const sql = `
      INSERT INTO cart (user_id, item_id, title, description, price, quantity, image, total_price)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
        quantity = quantity + ?, 
        total_price = ?;  
    `;

    console.log('Executing SQL:', sql);
    console.log('With parameters:', [
      user_id,
      item_id,
      product.title,
      product.description,
      product.price,
      quantity,
      product.image || null, 
      total_price, 
      quantity,
      total_price
    ]);

    await connection.query(sql, [
      user_id,
      item_id,
      product.title,
      product.description,
      product.price,
      quantity,
      product.image || null, 
      total_price, 
      quantity, 
      total_price
    ]);

    connection.release();
    console.log('Item added to cart successfully:', { user_id, item_id });
    return res.json({ success: true, message: 'Item added to cart' });
  } catch (error) {
    console.error('Database error occurred:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to add item to cart' });
  }
});




app.get('/cart/:userId', async (req, res) => {
  const userId = req.params.userId;

  try {
    const connection = await pool.getConnection();

    const sql = `
      SELECT 
        c.id AS cart_id, 
        c.item_id AS product_id, 
        p.title, 
        p.description, 
        p.price, 
        c.quantity, 
        pi.image
      FROM cart c
      LEFT JOIN products p ON c.item_id = p.id
      LEFT JOIN product_images pi ON p.id = pi.product_id
      WHERE c.user_id = ?
    `;

    const [results] = await connection.query(sql, [userId]);
    connection.release();

    return res.json({ success: true, cart: results });
  } catch (error) {
    console.error('Database error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch cart items' });
  }
});



// DELETE /cart/:user_id/:item_id
app.delete('/cart/:user_id/:item_id', async (req, res) => {
  const { user_id, item_id } = req.params;

  console.log('Received DELETE request with:', { user_id, item_id });

  if (!user_id || !item_id) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  try {
    const connection = await pool.getConnection();
    const userId = parseInt(user_id, 10);
    const itemId = parseInt(item_id, 10);

    // Fetch the product_id from the cart by joining the products table
    const [cartItem] = await connection.query(`
      SELECT c.item_id AS product_id FROM cart c
      LEFT JOIN products p ON c.item_id = p.id
      WHERE c.user_id = ? AND c.id = ?
    `, [userId, itemId]);

    // Check if the item exists in the cart
    if (cartItem.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Item not found in cart' });
    }

    const productId = cartItem[0].product_id;

    // Execute the DELETE query to remove the item from the cart
    const [deleteResult] = await connection.query(`
      DELETE FROM cart WHERE user_id = ? AND id = ?
    `, [userId, itemId]);

    connection.release();

    if (deleteResult.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Item could not be deleted' });
    }

    console.log('Item deleted successfully:', { userId, itemId });

    // Return the product_id for redirection after deletion
    return res.json({ success: true, message: 'Item removed from cart', productId });
  } catch (error) {
    console.error('Database error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to remove item from cart' });
  }
});





app.post('/api/orders', async (req, res) => {
  const { product_id, quantity, total_price, phone, location, email, user_id, name, title } = req.body;
  console.log('Received order data:', req.body);

  // Validate the required fields
  if (!product_id || !quantity || !total_price || !phone || !location || !name || !title) {
    console.log('Missing or invalid fields');
    return res.status(400).json({ success: false, message: 'Missing or invalid fields' });
  }

  try {
    // Check if user_id is provided, and if so, validate it by checking the signup table
    if (user_id) {
      const connection = await pool.getConnection();
      
      // Query the signup table to check if the user_id exists (use id from the signup table)
      const [userRows] = await connection.query('SELECT * FROM signup WHERE id = ?', [user_id]);
      
      if (userRows.length === 0) {
        console.log('User not authenticated');
        connection.release();
        return res.status(401).json({ success: false, message: 'User not authenticated' });
      }

      connection.release();
    }

    // Proceed with inserting the order into the orders table
    const connection = await pool.getConnection();
    const sql = `
      INSERT INTO orders (user_id, product_id, quantity, total_price, phone, location, order_date, email, name, title)
      VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?)
    `;
    
    // Insert order with user_id (which is still from the signup table) or null if not authenticated
    const [result] = await connection.query(sql, [user_id || null, product_id, quantity, total_price, phone, location, email, name, title]);
    connection.release();

    console.log('Order placed successfully, Order ID:', result.insertId);
    return res.json({ success: true, message: 'Order placed successfully', order_id: result.insertId });
  } catch (error) {
    console.error('Error saving order:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to place order' });
  }
});




app.post('/api/products', upload.array('images', 10), async (req, res) => {
  const { title, description, price, category, isNew } = req.body;
  const images = req.files;

  const categoryTableMap = {
    'phones_laptops': 'phones_laptops',
    'wifi_routers': 'wifi_routers',
    'beds': 'beds',
    'sofa_couches': 'sofa_couches',
    'woofers_tv': 'woofers_tv',
    'tables': 'tables',
    'kitchen_utensils': 'kitchen_utensils'
  };

  const categoryTableName = categoryTableMap[category];
  if (!categoryTableName) {
    return res.status(400).json({ success: false, message: 'Invalid category' });
  }

  try {
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    const insertProductQuery = `INSERT INTO products (title, description, price, is_new, category_id) VALUES (?, ?, ?, ?, ?)`;
    const categoryId = Object.values(categoryTableMap).indexOf(categoryTableName) + 1;
    const [productResult] = await connection.query(insertProductQuery, [title, description, price, isNew, categoryId]);
    const productId = productResult.insertId;

    const insertCategoryProductQuery = `INSERT INTO ${categoryTableName} (id, title, description, price, is_new, category_id) VALUES (?, ?, ?, ?, ?, ?)`;
    await connection.query(insertCategoryProductQuery, [productId, title, description, price, isNew, categoryId]);

    if (images && images.length > 0) {
      const insertImageQuery = `INSERT INTO product_images (product_id, image) VALUES (?, ?)`;
      const insertCategoryImageQuery = `UPDATE ${categoryTableName} SET image = ? WHERE id = ?`;

      for (let image of images) {
        await connection.query(insertImageQuery, [productId, image.buffer]); // Store raw image buffer or file data
        await connection.query(insertCategoryImageQuery, [image.buffer, productId]);
      }
    }

    await connection.commit();
    connection.release();
    return res.json({ success: true, message: 'Product and images added successfully!' });
  } catch (error) {
    console.error('Database error:', error.message);
    await connection.rollback();
    connection.release();
    return res.status(500).json({ success: false, message: 'Failed to add product' });
  }
});


app.get('/api/products/data', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const getProductsQuery = `
      SELECT p.id, p.title, p.description, p.price, p.is_new, p.category_id, pi.image 
      FROM products p
      LEFT JOIN product_images pi ON p.id = pi.product_id
    `;

    const [products] = await connection.query(getProductsQuery);
    connection.release();

    return res.json({ success: true, data: products });
  } catch (error) {
    console.error('Database error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
});



app.delete('/api/products/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const connection = await pool.getConnection();

    // First, fetch the product details to get its category_id
    const getProductQuery = `SELECT category_id FROM products WHERE id = ?`;
    const [product] = await connection.query(getProductQuery, [id]);

    if (!product || product.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const categoryId = product[0].category_id;

    // Map category_id to category table name
    const categoryTableMap = {
      1: 'phones_laptops',
      2: 'wifi_routers',
      3: 'beds',
      4: 'sofa_couches',
      5: 'woofers_tv',
      6: 'tables',
      7: 'kitchen_utensils'
    };

    const categoryTableName = categoryTableMap[categoryId];
    if (!categoryTableName) {
      return res.status(400).json({ success: false, message: 'Invalid category' });
    }

    // Start transaction
    await connection.beginTransaction();

    // Delete the product from the category-specific table
    const deleteFromCategoryQuery = `DELETE FROM ${categoryTableName} WHERE id = ?`;
    await connection.query(deleteFromCategoryQuery, [id]);

    // Delete associated images
    const deleteImagesQuery = `DELETE FROM product_images WHERE product_id = ?`;
    await connection.query(deleteImagesQuery, [id]);

    // Delete the product from the products table
    const deleteProductQuery = `DELETE FROM products WHERE id = ?`;
    const [result] = await connection.query(deleteProductQuery, [id]);

    await connection.commit();
    connection.release();

    if (result.affectedRows > 0) {
      return res.json({ success: true, message: 'Product and associated data deleted successfully' });
    } else {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
  } catch (error) {
    console.error('Error deleting product:', error);
    await connection.rollback();
    connection.release();
    return res.status(500).json({ success: false, message: 'Failed to delete product' });
  }
});




// Product Search API Endpoint
app.get('/api/products', async (req, res) => {
  const { search } = req.query;

  // Validate search parameter
  if (!search || search.trim().length === 0) {
      return res.status(400).json({
          success: false,
          message: 'Search term is required'
      });
  }

  try {
      const connection = await pool.getConnection();

      // Improved search query with better categorization and error handling
      const searchQuery = `
          SELECT 
              p.*,
              COALESCE(c.title, '') as category_title,
              COALESCE(c.category_type, '') as category_type
          FROM products p
          LEFT JOIN (
              SELECT id, title, 'phones_laptops' as category_type FROM phones_laptops
              UNION ALL
              SELECT id, title, 'wifi_routers' as category_type FROM wifi_routers
              UNION ALL
              SELECT id, title, 'beds' as category_type FROM beds
              UNION ALL
              SELECT id, title, 'sofa_couches' as category_type FROM sofa_couches
              UNION ALL
              SELECT id, title, 'woofers_tv' as category_type FROM woofers_tv
              UNION ALL
              SELECT id, title, 'tables' as category_type FROM tables
              UNION ALL
              SELECT id, title, 'kitchen_utensils' as category_type FROM kitchen_utensils
          ) AS c ON p.category_id = c.id
          WHERE 
              p.title LIKE ? OR 
              p.description LIKE ? OR
              c.title LIKE ?
          LIMIT 10`; // Added limit for better performance

      const searchTerm = `%${search.trim()}%`;
      const [results] = await connection.query(searchQuery, [searchTerm, searchTerm, searchTerm]);
      connection.release();

      if (results.length === 0) {
          return res.status(200).json({
              success: true,
              products: [],
              message: 'No products found'
          });
      }

      // Format the response to match frontend expectations
      const formattedResults = results.map(product => ({
          id: product.id,
          title: product.title,
          price: product.price,
          description: product.description,
          category: {
              title: product.category_title,
              type: product.category_type
          },
      }));

      return res.json({
          success: true,
          products: formattedResults
      });

  } catch (error) {
      console.error('Database error:', error);
      return res.status(500).json({
          success: false,
          message: 'Internal server error while searching products'
      });
  }
});



app.get('/api/products/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const connection = await pool.getConnection();

    // Query to fetch product details
    const productQuery = `SELECT id, title, description, price, is_new, category_id FROM products WHERE id = ?`;
    const [productResults] = await connection.query(productQuery, [id]);

    if (productResults.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const product = productResults[0];

    // Query to fetch product images
    const imageQuery = `SELECT image FROM product_images WHERE product_id = ?`;
    const [imageResults] = await connection.query(imageQuery, [id]);
    connection.release();

    // Convert images to base64 format
    const images = imageResults.map((img) => `data:image/jpeg;base64,${img.image.toString('base64')}`);

    // Combine product details with images
    const productWithImages = {
      ...product,
      images,
    };

    return res.json({ success: true, product: productWithImages });
  } catch (error) {
    console.error(`Error fetching product with ID ${id}:`, error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch product' });
  }
});









app.get('/phones_laptops', async (req, res) => {
  try {
    const connection = await pool.getConnection();

    
    const sql = `SELECT id, title, description, price, is_new, category_id, image FROM phones_laptops`;
    const [results] = await connection.query(sql);
    connection.release();

   
    const productsWithImages = results.map(product => ({
      id: product.id,
      title: product.title,
      description: product.description,
      price: product.price,
      is_new: product.is_new, 
      category_id: product.category_id,
      image: product.image ? `data:image/jpeg;base64,${product.image.toString('base64')}` : null // Convert BLOB to base64
    }));

    return res.json({ success: true, products: productsWithImages });
  } catch (error) {
    console.error('Error fetching phones_laptops products:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
});


app.get('/api/:table/:id', async (req, res) => {
  const { table, id } = req.params;

  try {
    const connection = await pool.getConnection();
    const sql = `SELECT id, title, description, price, is_new, category_id, image FROM ?? WHERE id = ?`;
    const [results] = await connection.query(sql, [table, id]);
    connection.release();

    if (results.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const product = results[0];
    
    const productWithImage = {
      id: product.id,
      title: product.title,
      description: product.description,
      price: product.price,
      is_new: product.is_new,
      category_id: product.category_id,
      image: product.image ? `data:image/jpeg;base64,${product.image.toString('base64')}` : null,
    };

    return res.json({ success: true, product: productWithImage }); // Ensure success flag is included
  } catch (error) {
    console.error(`Error fetching product from table ${table}:`, error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch product' });
  }
});





app.get('/wifi_routers', async (req, res) => {
  try {
    const connection = await pool.getConnection();

    
    const sql = `SELECT id, title, description, price, is_new, category_id, image FROM wifi_routers`;
    const [results] = await connection.query(sql);
    connection.release();

   
    const productsWithImages = results.map(product => ({
      id: product.id,
      title: product.title,
      description: product.description,
      price: product.price,
      is_new: product.is_new, 
      category_id: product.category_id,
      image: product.image ? `data:image/jpeg;base64,${product.image.toString('base64')}` : null // Convert BLOB to base64
    }));

    return res.json({ success: true, products: productsWithImages });
  } catch (error) {
    console.error('Error fetching phones_laptops products:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
});

app.get('/beds', async (req, res) => {
  try {
    const connection = await pool.getConnection();

    
    const sql = `SELECT id, title, description, price, is_new, category_id, image FROM beds`;
    const [results] = await connection.query(sql);
    connection.release();

   
    const productsWithImages = results.map(product => ({
      id: product.id,
      title: product.title,
      description: product.description,
      price: product.price,
      is_new: product.is_new, 
      category_id: product.category_id,
      image: product.image ? `data:image/jpeg;base64,${product.image.toString('base64')}` : null // Convert BLOB to base64
    }));

    return res.json({ success: true, products: productsWithImages });
  } catch (error) {
    console.error('Error fetching phones_laptops products:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
});


app.get('/sofa_couches', async (req, res) => {
  try {
    const connection = await pool.getConnection();

    
    const sql = `SELECT id, title, description, price, is_new, category_id, image FROM sofa_couches`;
    const [results] = await connection.query(sql);
    connection.release();

   
    const productsWithImages = results.map(product => ({
      id: product.id,
      title: product.title,
      description: product.description,
      price: product.price,
      is_new: product.is_new, 
      category_id: product.category_id,
      image: product.image ? `data:image/jpeg;base64,${product.image.toString('base64')}` : null // Convert BLOB to base64
    }));

    return res.json({ success: true, products: productsWithImages });
  } catch (error) {
    console.error('Error fetching phones_laptops products:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
});


app.get('/woofers_tv', async (req, res) => {
  try {
    const connection = await pool.getConnection();

    
    const sql = `SELECT id, title, description, price, is_new, category_id, image FROM woofers_tv`;
    const [results] = await connection.query(sql);
    connection.release();

   
    const productsWithImages = results.map(product => ({
      id: product.id,
      title: product.title,
      description: product.description,
      price: product.price,
      is_new: product.is_new, 
      category_id: product.category_id,
      image: product.image ? `data:image/jpeg;base64,${product.image.toString('base64')}` : null // Convert BLOB to base64
    }));

    return res.json({ success: true, products: productsWithImages });
  } catch (error) {
    console.error('Error fetching phones_laptops products:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
});

app.get('/tables', async (req, res) => {
  try {
    const connection = await pool.getConnection();

    
    const sql = `SELECT id, title, description, price, is_new, category_id, image FROM tables`;
    const [results] = await connection.query(sql);
    connection.release();

   
    const productsWithImages = results.map(product => ({
      id: product.id,
      title: product.title,
      description: product.description,
      price: product.price,
      is_new: product.is_new, 
      category_id: product.category_id,
      image: product.image ? `data:image/jpeg;base64,${product.image.toString('base64')}` : null // Convert BLOB to base64
    }));

    return res.json({ success: true, products: productsWithImages });
  } catch (error) {
    console.error('Error fetching phones_laptops products:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
});

app.get('/kitchen_utensils', async (req, res) => {
  try {
    const connection = await pool.getConnection();

    
    const sql = `SELECT id, title, description, price, is_new, category_id, image FROM kitchen_utensils`;
    const [results] = await connection.query(sql);
    connection.release();

   
    const productsWithImages = results.map(product => ({
      id: product.id,
      title: product.title,
      description: product.description,
      price: product.price,
      is_new: product.is_new, 
      category_id: product.category_id,
      image: product.image ? `data:image/jpeg;base64,${product.image.toString('base64')}` : null // Convert BLOB to base64
    }));

    return res.json({ success: true, products: productsWithImages });
  } catch (error) {
    console.error('Error fetching phones_laptops products:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
