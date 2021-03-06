var express = require('express');
var router = express.Router();
var fs = require('fs');
var path = require('path');
var NodeRSA = require('node-rsa');
var serialization = require("php-serialization");

var ensurePostReq = require('./acl.js')

var cms_public_key = fs.readFileSync(path.resolve(__dirname, '../../secret/v1/cms_public.key'));
var RSAkeyCMS = new NodeRSA(cms_public_key, 'public');
RSAkeyCMS.setOptions({ encryptionScheme: 'pkcs1' })

/** all post request need to be verified */

var themeRoutes = require('./themes')
var pluginRoutes = require('./plugins')
var downloadRoutes = require('../download')

/** Get the latest release of the cms  */
router.get('/get_update*', function (req, res) {
  Version.findOne({ state: 'RELEASE' }).sort('id DESC').exec(function (err, version) {
    if (err || !version)
      return res.status(404).json({ status: false, error: 'Not Found' });
    return res.status(200).json({
      type: version.type.toLowerCase(),
      visible: (version.visible),
      last_version: version.version
    })
  });
})

/** Route linked to download */
router.post('/update', ensurePostReq, downloadRoutes.get_cms)
router.post('/cms/update', ensurePostReq, downloadRoutes.get_cms)
router.post('/get_theme/:apiID', ensurePostReq, downloadRoutes.get_theme)
router.post('/get_plugin/:apiID', ensurePostReq, downloadRoutes.get_plugin)

/** Route linked to plugins */
router.get('/getFreeThemes', themeRoutes.getFreeThemes)
router.get('/getAllThemes', themeRoutes.getAllThemes)
router.get('/getPurchasedThemes/:licenseID', themeRoutes.getPurchasedThemes)

/** Route linked to themes */
router.get('/getFreePlugins', pluginRoutes.getFreePlugins)
router.get('/getAllPlugins', pluginRoutes.getAllPlugins)
router.get('/getPurchasedPlugins/:licenseID', pluginRoutes.getPurchasedPlugins)

/** Used to verify that the license used is valid */
router.post('/key_verif', ensurePostReq, function (req, res) {
  var data = { time: Math.floor(new Date().getTime() / 1000), domain: req.domain };

  //Serialize
  var serializedData = new serialization.Class("")
  serializedData.__addAttr__("time", "string", data.time, "integer")
  serializedData.__addAttr__("domain", "string", data.domain, "string")
  serializedData = serialization.serialize(serializedData, "array")

  try {
    var encoded = RSAkeyCMS.encrypt(serializedData, 'base64');
  } catch (exception) {
    return res.status(500).json({ status: 'error', msg: exception.message })
  }
  return res.status(200).json({ status: 'success', time: encoded })
})

/** Used to get the secret key to communicate between the CMS and the minecraft plugin  */
router.post('/get_secret_key', ensurePostReq, function (req, res) {
  // if the license/hosting doesnt have secret key, generate one for him
  if (req.license.secretKey === null) {
    req.license.secretKey = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for (var i = 0; i < 32; i++)
      req.license.secretKey += possible.charAt(Math.floor(Math.random() * possible.length));

    req.license.save(function (err) { })
  }

  // encrypt and send the key
  try {
    var encoded = RSAkeyCMS.encrypt(req.license.secretKey, 'base64');
  } catch (exception) {
    return res.status(500).json({ status: 'error', error: exception.message })
  }
  return res.status(200).json({ status: 'success', secret_key: encoded })
})

/** Used to create a ticket from CMS  */
router.post('/addTicket', ensurePostReq, function (req, res) {

  var data = req.body.debug,
    content = req.body.content,
    title = req.body.title;

  // if invalid data just tell him that its good
  if (data === undefined || content === undefined || title === undefined || title.length === 0 || content.length === 0)
    return res.sendStatus(200);

  data.id = req.license.id;
  data.type = req.type;

  // log data put by the cms
  Apilog.create({ action: 'DEBUG', ip: req.ip, api_version: 1, status: true, type: req.type.toUpperCase(), data: data }, function (err, log) {})

  // create the ticket
  Ticket.create({
    user: req.user,
    title: title,
    category: 'OTHER',
    license: req.license.id
  }, function (err, ticket) {
    if (err) return res.sendStatus(200);

    // create the actual message for the ticket
    Ticketreply.create({ user: req.user, ticket: ticket, content: content }, function (err, log) {
      return res.sendStatus(200);
    })
  })
})

/** Useless route but can be call so just send empty array */
router.post('/getCustomMessage', ensurePostReq, function (req, res) {
  return res.json({
      type: 1,
      messageHTML: '<div class="alert alert-warning"><b>Mise à jour:</b> Une mise à jour importante sortira Mardi 10 Octobre à 16h, celle-ci modifie le comportement des plugins et des thèmes (changements <a href="https://mineweb.org/versions">ici</a>).<b>VOUS DEVREZ IMPÉRATIVEMENT METTRE À JOUR VOS PLUGINS ET THEMES POUR QUE CEUX-CI FONCTIONNENT SUR LA MISE À JOUR <em>même les plugins et thèmes personnalisés (cf. la documentation qui sera mise à jour lundi 9 octobre a 16h)</em>.</b></div><div class="alert alert-warning"><b>Mise à jour:</b> Vous devrez refaire la liaison site-serveur avec un nouveau plugin si vous mettez à jour le CMS.</div>'
  });
})

/** Send faq data */
router.get('/getFAQ/:lang*?', function (req, res) {
  var lang = req.params.lang;
  if (!lang)
    return res.json([]);

  Faq.find({lang: lang}).exec(function (err, questions) {
    if (err) return res.json([])

    return res.json(questions || []);
  })
})

// register routes here
module.exports = router;
