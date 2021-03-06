const { server } = require("./src/app.js");
const { conn } = require("./src/db.js");

const port = process.env.PORT || 8080;
console.log(port);
// Syncing all the models at once.

conn.sync({ force: false }).then(() => {
  server.listen(port, () => {
    // eslint-disable-line no-console
    console.log(`Server listening on : ${port}`);
  });
});
