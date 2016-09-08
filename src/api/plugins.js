module.exports = {

  /** Get all plugins **/
  getAllPlugins: function (req, res) {
    Plugin.find().exec(function(err, plugins) {
        if (err)
          return res.json([]);
        return res.json(plugins)
    });
  },

  /** Get all free plugins **/
  getFreePlugins: function (req, res) {
    Plugin.find({ price: 0}).exec(function(err, plugins) {
        if (err)
          return res.json([]);
        return res.json(plugins)
    });
  },

  /** Get all purchased plugins by user**/
  getPurchasedPlugins: function (req, res) {
    var licenseID = req.query.licenseID;

    if (licenseID)
      return res.json([]);

    // search userId by using the license
    License.findOne({ id: licenseID }).exec(function (err, license) {
      if (license === undefined) {
        Hosting.findOne({ id: licenseID }).exec(function (err, hosting) {
          if (hosting === undefined) 
            return res.json([])
          else
            cb_found(hosting.user);
        })
      }
      else
        cb_found(license.user)
    })

    // when found, get plugin he has purchased
    var cb_found = function (userId) {
      Purchase.find({ user: userId, type: 'PLUGIN' }).exec(function (err, purchases) {
        if (purchases === undefined || purchases.length === 0)
          return res.json([]);
        
        // get an array of plugin id
        var plugin_ids = purchases.map(function (item) {
          return item.id;
        })

        // query all of them
        Plugin.find({ id: plugin_ids}).exec(function (err, plugins) {
          if (plugins === undefined || plugins.length === 0)
            return res.json([]);
          else
            return res.json(plugins);
        })
      })
    }
  }
};