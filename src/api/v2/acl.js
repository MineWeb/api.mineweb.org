module.exports = function (req, res, next) {
  // verify that the request contains the signed field
  if (req.body.signed === undefined) {
    return res.status(400).json({ status: 'error', msg: 'Invalid request' });
  }

  // try to decrypt the post data using RSA private key and parse it to json
  try {
    var data = JSON.parse(RSAkeyAPI.decrypt(req.body.signed));
  } catch (exception) {
    return res.status(400).json({ status: 'error', msg: 'Could not decrypt signed content' })
  }

  // verify that it contain all the info we need
  if (data.id === undefined || data.key === undefined || data.domain === undefined)
    return res.status(500).json({ status: 'error', msg: 'Data not complete' })

  var path = req.path.replace('/api/v2/', '')

  License.findOne({ id: data.id, key: data.key }).populate('user', 'hosting').exec(function (err, license) {
    // if the license isnt found, search for a hosting license
    if (license === undefined) {
      Log.create({ action: path, api_version: 2, ip: req.ip, status: false, error: 'Invalid ID or Key', data: data }, function (err, log) { })
      return res.status(404).json({ status: 'error', msg: 'ID_OR_KEY_INVALID' })
    }

    var type = license.hosting !== null ? 'license' : 'hosting';

    // verify that license hasnt been disabled by us
    if (license.suspended !== null && license.suspended.length > 0) {
      Log.create({ action: path, api_version: 2, ip: req.ip, status: false, error: 'License suspended', type: type.toUpperCase(), data: data }, function (err, log) { })
      return res.status(403).json({ status: false, msg: 'LICENSE_DISABLED' })
    }

    // verify that the license/hosting isnt disabled by user
    if (license.state === false) {
      Log.create({ action: path, api_version: 2, ip: req.ip, status: false, error: 'License disabled by user', type: type.toUpperCase(), data: data }, function (err, log) { })
      return res.status(403).json({ status: 'error', msg: 'LICENSE_DISABLED' })
    }

    // verify that the input domain is a valid one
    if (/(https?:\/\/(?:www\.|(?!www))[^\s\.]+\.[^\s]{2,}|www\.[^\s]+\.[^\s]{2,})/.test(data.domain) === false) {
      Log.create({ action: path, api_version: 2, ip: req.ip, status: false, type: type.toUpperCase(), data: data }, function (err, log) { })
      return res.status(403).json({ status: 'error', msg: 'INVALID_URL' })
    }

    // normalize last slash in domain
    if (license.host !== null) {
      license.host = license.host[license.host.length - 1] === '/' ? license.host.substr(0, license.host.length - 1) : license.host;
      data.domain = data.domain[data.domain.length - 1] === '/' ? data.domain.substr(0, data.domain.length - 1) : data.domain;

      var domain = license.host.toLowerCase();
      var input_domain = data.domain.toLowerCase();

      // normalize domain in the db
      if (domain.hosting !== null && domain.hosting.hostType === 'SUBDOMAIN')
        domain = 'http://' + domain + ".craftwb.fr";
      else if (domain.hosting !== null && domain.hosting.hostType === 'DOMAIN')
        domain = 'http://' + domain;
      else if (domain.indexOf('www.') !== -1)
        domain = domain.replace('www.', '');

      if (input_domain.indexOf('www.') !== -1)
        input_domain = input_domain.replace('www.', '');

      // verify that domain match
      if (input_domain !== domain) {
        Log.create({ action: path, api_version: 2, ip: req.ip, status: false, error: 'Domain doesnt match', type: type.toUpperCase(), data: data }, function (err, log) { })
        return res.status(403).json({ status: 'error', msg: 'INVALID_URL' });
      }
    }

    // its all good, log the request and pass the request to the actual route
    Log.create({ action: path, api_version: 2, ip: req.ip, status: true, type: type.toUpperCase(), data: data }, function (err, log) { })
    req.model = license;
    req.type = type;
    req.domain = domain || 'none';
    req.user = model.user;

    return next()
  })
}