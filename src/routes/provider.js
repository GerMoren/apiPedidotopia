const server = require("express").Router();
const { Provider } = require("../db");

server.post("/", (req, res) => {
  const { name } = req.body;

  Provider.create({
    name,
  }).then((provider) => {
    res.send(provider);
  });
});

async function createProviders(providers) {
  const provs = await providers.map((p) => {
    Provider.findOrCreate({
      where: {
        name: p.name,
      },
    }).catch((e) => console.log(e));
  });
}

const providers = [{ name: "Mercado Libre" }, { name: "Shopify" }];

setTimeout(() => {
  createProviders(providers);
}, 2500);

module.exports = server;
