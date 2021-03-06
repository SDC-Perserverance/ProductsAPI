const { MongoClient } = require("mongodb");
const csv = require("csv-parser");
const fs = require("fs");
const path = require("path");

const uri = "mongodb://localhost:27017/SDC";

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function parseProducts() {
  let entry, operations;
  const database = client.db("SDC");
  const productInfoColl = database.collection("product_info");
  const stream = fs.createReadStream(path.join(__dirname, '/../data/product.csv')).pipe(csv());

  productInfoColl.createIndex( { id: 1 } );

  operations = [];

  console.log('Loading Products to database...')
  for await (const chunk of stream) {
    entry = {
      insertOne: {
        document: {
          id: Number(chunk['id']),
          name: chunk['name'],
          slogan: chunk['slogan'],
          description: chunk['description'],
          category: chunk['category'],
          default_price: chunk['default_price'].trim(),
        }
      }
    };

    operations.push(entry);
    if (operations.length > 500) {
      productInfoColl.bulkWrite(operations)
      .catch(err => {console.log(err);})
      operations = [];
    }
  }
  if (operations.length) {
    productInfoColl.bulkWrite(operations)
    .catch(err => {console.log(err);})
  }
  console.log('Finished loading products!')
}

async function parseFeatures() {
  let entry, operations, allFeatures, currentProduct, product_id, feature, value;
  const database = client.db("SDC");
  const productFeaturesColl = database.collection("product_features");
  const stream = fs.createReadStream(path.join(__dirname, '/../data/features.csv')).pipe(csv());

  productFeaturesColl.createIndex( { product_id: 1 } );

  operations = [];
  allFeatures = [];
  currentProduct = 1;

  console.log('Loading features into database...')
  for await (const chunk of stream) {
    product_id = Number(chunk['product_id']);
    feature = chunk['feature'];
    value = chunk['value'];

    if (value === 'null') {
      continue;
    }
    if (currentProduct === product_id) {
      allFeatures.push( {feature, value} );
    } else {
      createEntry()
      currentProduct = product_id
      allFeatures = [ {feature, value} ];

      if (operations.length > 500) {
        await productFeaturesColl.bulkWrite(operations)
        operations = [];
      }
    }
  }

  if (allFeatures.length) {
    createEntry();
    await productFeaturesColl.bulkWrite(operations)
  }

  function createEntry() {
    entry = {
      insertOne: {
        document: {
          product_id: currentProduct,
          features: allFeatures.slice()
        }
      }
    };
    operations.push(entry);
  }

  console.log('Finished loading features!')
}

async function parseRelatedProducts() {
  let entry, operations, allRelated, currentProduct, product_id, related;
  const database = client.db("SDC");
  const relatedProductsColl = database.collection("related_products");
  const stream = fs.createReadStream(path.join(__dirname, '/../data/related.csv')).pipe(csv());

  relatedProductsColl.createIndex( { product_id: 1 } );

  operations = [];
  allRelated = [];
  currentProduct = 1;

  console.log('Loading related products into database...')
  for await (const chunk of stream) {
    product_id = Number(chunk['current_product_id']);
    related = Number(chunk['related_product_id']);

    if (currentProduct === product_id) {
      allRelated.push( related );
    } else {
      createEntry()
      currentProduct = product_id
      allRelated = [ related ];

      if (operations.length > 500) {
        await relatedProductsColl.bulkWrite(operations)
        operations = [];
      }
    }
  }

  if (allRelated.length) {
    createEntry();
    await relatedProductsColl.bulkWrite(operations)
  }

  function createEntry() {
    entry = {
      insertOne: {
        document: {
          product_id: currentProduct,
          related_products: allRelated.slice()
        }
      }
    };
    operations.push(entry);
  }

  console.log('Finished loading related products!')
}

async function parseStyles() {
  let entry, operations;
  const database = client.db("SDC");
  const productStylesColl = database.collection("product_styles");
  const stream = fs.createReadStream(path.join(__dirname, '/../data/styles.csv')).pipe(csv());

  productStylesColl.createIndex( { product_id: 1 } );
  productStylesColl.createIndex( { style_id: 1 } );

  operations = [];

  console.log('Loading styles into database...');
  for await (const chunk of stream) {
    entry = {
      insertOne: {
        document: {
          'product_id': Number(chunk['productId']),
          'style_id': Number(chunk['id']),
          'default?': chunk['default_style'] === '1' ? true : false,
          'sale_price': chunk['sale_price'] === 'null' ? '0' : chunk['sale_price'],
          'original_price': chunk['original_price'],
          'name': chunk['name']
        }
      }
    };

    operations.push(entry);
    if (operations.length > 500) {
      productStylesColl.bulkWrite(operations)
      .catch(err => {console.log(err);})
      operations = [];
    }
  }
  if (operations.length) {
    productStylesColl.bulkWrite(operations)
    .catch(err => {console.log(err);})
    operations = [];
  }
  console.log('Finished loading styles')
}

async function parsePhotos() {
  let entry, operations;
  const database = client.db("SDC");
  const productStylesColl = database.collection("product_styles");
  const stream = fs.createReadStream(path.join(__dirname, '/../data/photos.csv')).pipe(csv());

  operations = [];

  console.log('Updating styles with photos...');
  for await (const chunk of stream) {
    entry = {
      updateOne: {
        filter: { style_id: Number(chunk[' styleId']) },
        update: { $push: { photos: { url: chunk[' url'], thumbnail_url: chunk[' thumbnail_url'] } } }
      }
    };
    operations.push(entry);

    if (operations.length > 500) {
      await productStylesColl.bulkWrite(operations)
      operations = [];
    }
  }

  if (operations.length) {
    productStylesColl.bulkWrite(operations)
    .catch(err => {console.log(err);})
    operations = [];
  }
  console.log('Finished updating styles with photos!')
}

async function parseSKU() {
  let entry, operations, style_id, size, quantity;
  const database = client.db("SDC");
  const productStylesColl = database.collection("product_styles");
  const stream = fs.createReadStream(path.join(__dirname, '/../data/skus.csv')).pipe(csv());

  operations = [];

  console.log('Updating styles with skus...')
  for await (const chunk of stream) {
    id = chunk['id'];
    style_id = Number(chunk[' styleId']);
    size = chunk[' size'];
    quantity = chunk[' quantity'];

    entry = {
      updateOne: {
        filter: { style_id: style_id },
        update: { $push: { skus:  {[id]: { size, quantity } } } }
      }
    };
    operations.push(entry);

    if (operations.length > 500) {
      await productStylesColl.bulkWrite(operations)
      operations = [];
    }
  }
  if (operations.length) {
    productStylesColl.bulkWrite(operations)
    .catch(err => {console.log(err);})
    operations = [];
  }

  console.log('Finished updating styles with skus!')
}

async function runAll() {
  await client.connect();
  await parseProducts();
  await parseFeatures();
  await parseRelatedProducts();
  await parseStyles();
  await parsePhotos();
  await parseSKU();
  await client.close();
}

runAll();