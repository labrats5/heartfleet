require([
  // Map/Search stuff
  "esri/map",
  "esri/dijit/Search",
  "esri/symbols/Font",
  "esri/geometry/Point",
  "esri/SpatialReference",
  "esri/symbols/SimpleMarkerSymbol",
  "esri/symbols/PictureMarkerSymbol",
  "esri/symbols/SimpleLineSymbol",
  "esri/Color",
  "esri/symbols/TextSymbol",

  // CSV specific stuff
  "esri/layers/CSVLayer",
  "esri/renderers/SimpleRenderer",
  "esri/InfoTemplate",
  "esri/urlUtils",

  "dijit/registry",
  "dijit/form/Button",
  "dojo/parser",
  "dijit/layout/BorderContainer",
  "dijit/layout/ContentPane",
  "dojo/domReady!"
], function (
  Map,
  Search,
  Font,
  Point,
  SpatialReference,
  SimpleMarkerSymbol,
  PictureMarkerSymbol,
  SimpleLineSymbol,
  Color,
  TextSymbol,

  // CSV specifc stuff
  CSVLayer,
  SimpleRenderer,
  InfoTemplate,
  urlUtils,

  registry,
  Button,
  parser
) {
  parser.parse();

  // urlUtils.addProxyRule({
  //   proxyUrl: "/proxy/",
  //   urlPrefix: "earthquake.usgs.gov"
  // });

  var map = new Map("map", {
    basemap: "dark-gray",
    center: [-74, 40.728], // lon, lat
    zoom: 14
  });

  // var csv = new CSVLayer("/data/quakes.csv", {
  //   copyright: "USGS.gov"
  // });
  var csv = new CSVLayer("/data/aeds.csv", {
    copyright: "MIT"
  })
  var marker = new PictureMarkerSymbol("/images/aed.png", 37, 24)
  var renderer = new SimpleRenderer(marker);
  csv.setRenderer(renderer);
  var template = new InfoTemplate(
    "${name}", 
    "${address}<button data-href='/aedLocations/${id}' class='btn btn-primary' id='send-location'>Send Location</button>"
  );
  csv.setInfoTemplate(template);
  map.addLayer(csv);

  //Do not provide a srcNode dom for the Search widget as the UI is not displayed. 

  var search = new Search({
    enableLabel: true,
    enableInfoWindow: false,
    map: map
  }, "");

  search.startup();

  $("#address input").focus(function(e) {
    $("#logo").addClass("cloaked")
    $("#dispatch").removeClass("cloaked")
    // wait until the fade completes
    window.setTimeout(function() {
      $("#address").addClass("wide")
    }, 250)
  })

  // $("#address input").blur(function(e) {
  //   $("#address").removeClass("wide")
  //   $("#dispatch").addClass("cloaked")
  //   window.setTimeout(function() {
  //     $("#logo").removeClass("cloaked")
  //   }, 800)
  // })

  $("#address").on("submit", submitAddress)
  $("#dispatch").on("click", submitAddress)

  function submitAddress(e) {
    e.preventDefault()
    var address = $("#address input").val().trim()
    if (address) {
      doSearchValue(address)
    }
    else {
      console.error("Address is blank!")
    }
  }

  // dispatch a postmate
  $("#dispatch").on("click", function(e) {
    e.preventDefault()
    var address = $("#address input").val().trim()
    if (address) {
      doSearchValue(address)
      getLatLong(address)
    }
    else {
      console.error("Address is blank!")
    }
  })

  $("#map").on("click", "#send-location", function(e) {
    var href = $(this).text("Message Sent!").attr("disabled", "disabled").attr("data-href")
    e.preventDefault()
    $.ajax({
      url: "twilio",
      method: "POST",
      data: {
        phoneNumber: '+13472245274',
        AEDlink: window.location.origin + href
      },
      success: function(response) {
        console.log("success", response)
      },
      error: function(error) {
        console.error("error", error)
      }
    })
  })

  function sendPostmate(pickupAddress, dropoffAddress) {
    $.ajax({
      url: "/postmate",
      method: "POST",
      data: {
        manifest: "AED",
        pickup_name: "AED",
        pickup_address: pickupAddress,
        pickup_phone_number: "555-555-5555",
        pickup_notes: "This is an AED!",
        dropoff_name: "Victim",
        dropoff_address: dropoffAddress,
        dropoff_phone_number: "415-555-1234", //really want a real one
        dropoff_notes: "Optional note to ring the bell", //maybe nice, not that big a deal
        robo_pickup: "00:10:00",
        robo_pickup_complete: "00:20:00",
        robo_dropoff: "00:21:00",
        robo_delivered: "00:34:00"

      },
      success: deliveryProgress,
      error: function(error) {
        console.error(error)
      }
    })
  }

  $("#eta").click(function() {
    deliveryProgress({})
  })
  function deliveryProgress(response) {
    console.log(response)

    $("#search-bar").addClass("hide")
    $("#progress-bar").removeClass("hide")

    var totalWidth = $("#progress-bar").width()
    var rightmostPosition = totalWidth - 180

    var timeToDelivery
    var isDemo = true
    if (isDemo) {
      timeToDelivery = 30000
    }
    else {
      var eta = new Date(response.succesObj._quote.dropoff_eta)
      var now = new Date()
      timeToDelivery = now - eta
    }

    secondsToDelivery = Math.floor(timeToDelivery / 1000)
    var timeinterval = setInterval(function(){
      --secondsToDelivery
      $("#seconds").text(secondsToDelivery)
      if(secondsToDelivery <= 0){
        clearInterval(timeinterval);
      }
    },1000);

    $("#progress-bar .bar").animate(
      { left: [ rightmostPosition, "linear" ] },
      timeToDelivery,
      function() {
        $("#delivered-modal").modal('show')
        console.log("completed transition!")
      }
    )
  }

  function doSearchValue(location) {

    //highlight symbol
    var sms = new PictureMarkerSymbol("/images/callerLocation.png", 32, 48)

    //label text symbol
    var ls = new TextSymbol()
      .setColor(new Color([0, 0, 0, 0.9]))
      .setFont(new Font("16px", Font.STYLE_NORMAL, Font.VARIANT_NORMAL, Font.WEIGHT_BOLD, "Arial"))
      .setOffset(15, -5)
      .setAlign(TextSymbol.ALIGN_START);

    search.sources[0].highlightSymbol = sms; //set the symbol for the highlighted symbol
    search.sources[0].labelSymbol = ls; //set the text symbol for the label

    //If multiple results are found, it will default and select the first.
    search.search(location);
  }

  function findNearestAED(dropoffAddress, lat, lon) {
    var closestAED = {};
    var closestDistance = -1;
    var csvFile;
    $.get("/data/aeds.csv", function(res) {
      csvFile = res;
      var result = $.csv.toObjects(csvFile);
      var i;
      for (i=0; i<result.length; i++) {
        var distance = Math.sqrt(Math.pow(lat - result[i].latitude, 2) + Math.pow(lon - result[i].longitude, 2));
        if (distance < closestDistance || closestDistance === -1) {
          closestDistance = distance;
          closestAED = result[i];
        } 
      }
      console.log("closestAED: ", closestAED)
      sendPostmate(closestAED.address, dropoffAddress)
    });
  }

  function getLatLong(address) {
    var response = '';
    $.get('https://maps.googleapis.com/maps/api/geocode/json?address=' +
      encodeURIComponent(address) +
      '&key=AIzaSyDUusw02mfbM9U9Zo5njJiVT1kKcEWM8XU', 
      function(res) {
        var location = res.results[0].geometry.location
        console.log(res);
        findNearestAED(address, location.lat, location.lng)
    });

  }

});
