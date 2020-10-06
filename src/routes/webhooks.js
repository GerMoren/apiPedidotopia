const server = require("express").Router();
const fetch = require("node-fetch");
const meli = require("mercadolibre");

//Modelos
const {
  Product,
  Category,
  Orders,
  Productprovider,
  Provider,
} = require("../db.js");

//Shopify y MeLi
let {
  SHOPIFY_API_KEY,
  SHOPIFY_API_PASSWORD,
  APP_DOMAIN,
  USER_ID_MELI,
  client_id,
  client_secret,
  redirect_uri,
  code,
  access_token,
  refresh_token,
} = process.env;

//var refresh_token = "";
const testUrl = `https://${SHOPIFY_API_KEY}:${SHOPIFY_API_PASSWORD}@${APP_DOMAIN}/admin/api/2020-07/`;

const mercadolibre = new meli.Meli(
  client_id,
  client_secret,
  access_token,
  refresh_token
);

const getUrlCode = mercadolibre.getAuthURL(redirect_uri);
// console.log(getUrlCode);

const meliAuthorize = mercadolibre.authorize(code, redirect_uri, (err, res) => {
  if (res.access_token) {
    // console.log(res);
    access_token = res.access_token;
    refresh_token = res.refresh_token;
  }
});

const meliRefreshToken = mercadolibre.refreshAccessToken((err, res) => {
  access_token = res.access_token;
  refresh_token = res.refresh_token;
  // console.log(res);
});

//Ruta que recibe la notificación desde shopify cuando se crea una nueva orden
server.post("/shopify", (req, res, next) => {
  const rta = req.body;
  // console.log(JSON.stringify(rta));
  res.send();
  var ProductId;
  const items = rta.line_items[0];

  Product.findOne({
    where: {
      productId_Shopify: items.product_id,
    },
  })
    .then((values) => {
      // console.log(values + " estooo");
      ProductId = values.dataValues.id;
      return Orders.create({
        shopify_Id: req.body.id,
        cantidad: req.body.line_items[0].quantity,
        total: req.body.total_price,
        subtotal: req.body.subtotal_price,
        status: "created",
        user_Id: req.body.user_id,
      });
    })
    .then((order) => {
      // console.log(order);
      order.setProducts(ProductId);
    })
    .catch((error) => console.error("Error: " + error));
});

//Ruta que recibe la notificación desde meli cuando se crea una nueva orden/nuevo producto/modificar producto (ESTA ES LA QUE VA!)
server.post("/meli", (req, res, next) => {
  const rta = req.body;
  // console.log(rta)
  const topic = req.body.topic;
  if (topic === "items") {
    const rta = req.body;
    // console.log("Llegó la respuesta de MELI: " + JSON.stringify(rta));
    var id = req.body.resource.split("/");
    var productId = id[id.length - 1];
    var category_id;
    var title;
    var productId_Meli;
    var images;
    var stock;
    var precio;
    var link;
    // console.log(productId + " ACAAAAA");

    fetch(
      `https://api.mercadolibre.com/items/${productId}?access_token=${access_token}`,
      {
        method: "GET",
      }
    )
      .then((response) => response.json())
      .then((product) => {
        console.log(product);
        category_id = product.category_id;
        title = product.title;
        productId_Meli = product.id;
        images =
          product.pictures &&
          product.pictures.map((i) => {
            return i.secure_url;
          });
        stock = product.initial_quantity;
        precio = product.price;
        link = product.permalink;
        return Product.findOne({ where: { productId_Meli: product.id } });
      })
      .then((values) => {
        console.log(values);
        if (!values) {
          return Product.create({
            title,
            productId_Meli,
            images,
          });
        } else {
          res.status(500).send({
            message: `ya existe el producto con Id de Meli: ${productId_Meli} en la BD`,
          });
        }
      })
      .then((product) => {
        console.log(product);
        productId = product.dataValues.id;
        return Category.findOrCreate({
          where: {
            title_sugerido: category_id,
          },
        });
      })
      .then((category) => {
        console.log(category);
        return category[0].addProducts(productId);
      })
      .then((v) => {
        console.log(v);
        return Provider.findByPk(1);
      })
      .then((provider) => {
        //  console.log(provider)
        return provider.addProducts(productId, {
          through: {
            stock,
            precio,
            link,
          },
        });
      })
      .then((value) => {
        res.send(value);
      })
      .catch((error) => next("Error: " + error));
  } else if (topic === "created_orders") {
    var order2;
    var itemID;
    // console.log("Llegó la respuesta de MELI: " + JSON.stringify(rta));
    var id = req.body.resource.split("/");
    var orderId = id[id.length - 1];
    // console.log(orderId + " ACAAAAA");

    fetch(
      `https://api.mercadolibre.com/orders/${orderId}?access_token=${access_token}`,
      {
        method: "GET",
      }
    )
      .then((response) => response.json())
      .then((order) => {
        itemID = order.order_items[0].item.id;
        return Orders.findOrCreate({
          where: {
            meli_Id: order.id,
            cantidad: order.order_items[0].quantity,
            total: order.total_amount,
            status: "created",
            user_Id: order.buyer.id,
          },
        })
          .then((created) => {
            order2 = created[0];
            console.log(order2);
            return Product.findOne({
              where: { productId_Meli: itemID },
            });
          })
          .then((product) => {
            const ProductId = product.dataValues.id;

            return order2.addProducts(ProductId);
          })
          .then((value) => {
            console.log(value);
            res.status(200).send(value);
          })
          .catch((error) => console.error("Error: " + error));
      });
  }
});

//Ruta que recibe la notificación desde shopify cuando se crea/actualiza un producto
server.post("/shopify/create", (req, res, next) => {
  const productCreate = req.body;
  console.log(productCreate);
  // console.log(productCreate.variants[0].sku);
  var productId;
  Product.findOne({ where: { productId_Shopify: productCreate.id } })
    .then((value) => {
      // console.log("vallues: ", value);
      if (!value) {
        return Product.create({
          title: productCreate.title,
          description: productCreate.body_html,
          sku: productCreate.variants[0].sku,
          stock_inicial: productCreate.variants[0].old_inventory_quantity,
          precio_inicial: productCreate.variants[0].price,
          images: productCreate.images.map((i) => {
            return i.src;
          }),
          productId_Shopify: productCreate.id,
        });
      } else {
        res.status(500).send({
          message: `ya existe el producto con Id de shopify: ${productCreate.id} en la BD`,
        });
      }
    })
    .then((product) => {
      console.log(product);
      productId = product.dataValues.id;
      return Category.findOrCreate({
        where: {
          title_sugerido: productCreate.handle,
        },
      });
    })
    .then((category) => {
      // console.log(category);
      return category[0].setProducts(productId);
    })
    .then((v) => {
      // console.log(v);
      return Provider.findByPk(2);
    })
    .then((provider) => {
      provider.addProducts(productId, {
        through: {
          link: `https://${APP_DOMAIN}/products/${productCreate.title
            .toLowerCase()
            .replace(/\s+/g, "-")}`,
          stock: productCreate.variants[0].inventory_quantity,
          precio: productCreate.variants[0].price,
        },
      });
      res.send();
    })
    .catch((error) => next("Error: " + error));
});

//Ruta que recibe la notificación desde meli cuando se crea/actualiza un producto (YA NO SE USA ESTA!!)
server.post("/newproduct/meli", (req, res, next) => {
  const rta = req.body;
  console.log("Llegó la respuesta de MELI: " + JSON.stringify(rta));
  var id = req.body.resource.split("/");
  var productId = id[id.length - 1];
  var category_id;
  console.log(productId + " ACAAAAA");

  fetch(
    `https://api.mercadolibre.com/items/${productId}?access_token=${access_token}`,
    {
      method: "GET",
    }
  )
    .then((response) => response.json())
    .then((product) => {
      category_id = product.category_id;
      //  console.log(JSON.stringify(product) + " RESPUESTA MELI!!! ");
      Product.findOrCreate({
        where: {
          title: product.title,
          productId_Meli: product.id,
          images: product.pictures.map((i) => {
            return i.secure_url;
          }),
        },
      })
        .then((product) => {
          //  console.log(product);
          productId = product[0].dataValues.id;
          return Category.findOrCreate({
            where: {
              title_sugerido: category_id,
            },
          });
        })
        .then((category) => {
          //  console.log(category);
          return category[0].setProducts(productId);
        })
        .then((v) => {
          //  console.log(v);
          return Provider.findByPk(1);
        })
        .then((provider) => {
          //  console.log(provider)
          return provider.setProducts(productId, {
            through: {
              stock: product.initial_quantity,
              precio: product.price,
              link: product.permalink,
            },
          });
        })
        .then(() => {
          res.sendStatus(200);
        })
        .catch((error) => next("Error: " + error));
    });
});

server.get("/orders/fulfilled", (req, res) => {
  Orders.findAll({
    include: Product,
  }).then((order) => res.send(order));
});

module.exports = server;
