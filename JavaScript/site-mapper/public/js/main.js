// init the Algorithmia client with your API key from https://algorithmia.com/user#credentials
var algoClient = Algorithmia.client('simeyUbLXQ/R8Qga/3ZCRGcr2oR1');

var algorithms = {
  autotag: '/nlp/AutoTag/1.0.1',
  url2text: '/util/Url2Text/0.1.4',
  getlinks: '/web/GetLinks/0.1.5',
  pagerank: '/thatguy2048/PageRank/0.1.0',
  summarizer: '/SummarAI/Summarizer/0.1.3'
};

var colorScale = d3.scale.linear().domain([0, 0.4, 1]).range(["yellow", "red", "#5000be"]);
var graphObj = null;
var pending = [];
var count = 0;
var depthLimit = 3;
var siteMap = {};
var pageranks = {};

/**
 * once DOM is ready, update vars amd set initial URL
 */
$(document).ready(function() {
  setInviteCode('sitemapper');
  $('[data-toggle="popover"]').popover();
  $('#siteUrl').val("http://algorithmia.com/");
  $('#depthLimit').val(depthLimit);
  scrape();
});

var scrape = function(url) {
  if(!url) {url = $('#siteUrl').val();}
  url = prefixHttp(url);
  depthLimit = $('#depthLimit').val();
  siteMap = {};
  pending = [url];
  count = 0;
  $('#link-details').hide();
  startViz();
  $('#scrape-status').text("Analyzing site...");
  doScrape();
};

var doScrape = function() {
  if (pending.length === 0 || count >= depthLimit) {
    rankPage(siteMap, function(ranking) {
      $('#scrape-status').text("");
      // $('#pagerank').text(ranking);
      var pagerankSorted = sortMap(ranking);
      var pagerankSortedHtml = '';
      // pagerank = ranking;
      for (var i in pagerankSorted) {
        pageranks[pagerankSorted[i].url] = pagerankSorted[i].rank;
        pagerankSortedHtml += '<div class="col-xs-2"><p>'+round(pagerankSorted[i].rank)+'</p></div>';
        pagerankSortedHtml += '<div class="col-xs-10 pagerank-links"><p class="pagerank-url"><a onclick="loadLink(\''+pagerankSorted[i].url+'\')">'+pagerankSorted[i].url+'</a></p></div>';
      }
      $('#pagerank-sorted').html(pagerankSortedHtml);
      updateRanking(ranking);
    });
    return;
  }
  var url = pending.shift();
  if (siteMap[url]) {
    doScrape();
  } else {
    count++;
    getLinks(url, function(output) {
      if (!output.error) {
        siteMap[url] = output.result;
        updateGraph(siteMap);
        pending = pending.concat(output.result);
      }
      doScrape();
    });
  }
};

var loadLink = function(url) {
  $('#link-url').text(url).attr('href',url);
  $('#link-rank').text(round(pageranks[url]));
  $('#link-summary, #link-tags').html('<span class="aspinner demo-spinner"></span>');
  $('#link-details').show();
  algoClient.algo(algorithms.url2text).pipe(url).then(function(output) {
    if (output.error) {return showError(output.error);}
    algoClient.algo(algorithms.summarizer).pipe(output.result).then(function(output) {
      if (output.error) {return showError(output.error);}
      $('#link-summary').text(output.result.summarized_data);
    });
    return algoClient.algo(algorithms.autotag).pipe([output.result]).then(function(output) {
      if (output.error) {return showError(output.error);}
      var resultHtml = '';
      for (i in output.result) {
        resultHtml += '<span class="label label-purple">'+output.result[i]+'</span> ';
      }
      $('#link-tags').html(resultHtml);
    });
  });
};

var showError = function(error) {
  console.error(error);
  $('#scrape-status').html('<div class="text-danger">'+error.message.replace('java.net.UnknownHostException','Invalid URL')+'</div>');
  // $("#pagerank-out").html(errorHtml);
  // $("#demo-status").html(errorHtml);
};

var round = function(n) {
  return (Math.floor(n * 100) / 100).toFixed(2);
};

var startViz = function() {
  var clickHandler, colors, height, radius, svg, width;
  svg = d3.select("svg.viz");
  width = $(".viz-container").width();
  height = $(".viz-container").height();
  colors = function(d) {
    if (d.rank === -1) {
      return "blue";
    } else {
      return colorScale(d.rank);
    }
  };
  radius = function(d) {
    if (d.rank === -1) {
      return 6;
    } else {
      return 6 + d.rank * 6;
    }
  };
  clickHandler = function(d) {
      loadLink(d.name);
  };
  graphObj = new Algorithmia.viz.Graph(svg, width, height, colors, radius, clickHandler);
};

var updateGraph = function(links) {
  var graph, svg;
  svg = d3.select("svg.viz");
  graph = {
    nodes: getNodes(links),
    links: links
  };
  graphObj.update(graph, null);
};

var updateRanking = function(ranking) {
  var weight;
  weight = function(d) {
    return ranking[d];
  };
  graphObj.updateRanking(weight);
};

var getLinks = function(url, cb) {
  var inputJson;
  inputJson = [url, true];
  algoClient.algo(algorithms.getlinks).pipe(inputJson).then(cb);
};

var rankPage = function(graph, cb) {
  var graphMatrix, nodes;
  // $("#demo-status").text("");
  // $("#pagerank-out").text("");
  nodes = getNodes(graph);
  graphMatrix = graphObjectToMatrix(graph, nodes);
  // $("#pagerank-in").html("<pre>" + JSON.stringify(graphMatrix, null, 2) + "</pre>");
  algoClient.algo(algorithms.pagerank).pipe(graphMatrix).then(function(output) {
    if (output.error) {
      showError(output.error);
      return;
    }
    // var pre = $("<pre>").text(JSON.stringify(output, null, 2));
    // $("#pagerank-out").html(pre);
    // $("#demo-status").text("");
    var result = normalize(output.result);
    var ranking = {};
    var i, _i, _len;
    for (i = _i = 0, _len = result.length; _i < _len; i = ++_i) {
      ranking[nodes[i]] = result[i];
    }
    if (cb) {
      cb(ranking);
    }
  });
};

var getNodes = function(graph) {
  var link, links, page, pageMap, _i, _len;
  pageMap = [];
  for (page in graph) {
    links = graph[page];
    if (pageMap.indexOf(page) === -1) {
      pageMap.push(page);
    }
    for (_i = 0, _len = links.length; _i < _len; _i++) {
      link = links[_i];
      if (pageMap.indexOf(link) === -1) {
        pageMap.push(link);
      }
    }
  }
  return pageMap;
};

var graphObjectToMatrix = function(graph, nodes) {
  var links, page, transformedGraph;
  transformedGraph = nodes.map(function() {
    return [];
  });
  for (page in graph) {
    links = graph[page];
    transformedGraph[nodes.indexOf(page)] = links.map(function(link) {
      return nodes.indexOf(link);
    });
  }
  return transformedGraph;
};

var normalize = function(data) {
  var max, min;
  min = Math.min.apply(Math, data);
  max = Math.max.apply(Math, data);
  return data.map(function(d) {
    return (d - min) / (max - min);
  });
};

var sortMap = function(input) {
  var k, list, v;
  list = (function() {
    var _results;
    _results = [];
    for (k in input) {
      v = input[k];
      _results.push({
        url: k,
        rank: v
      });
    }
    return _results;
  })();
  list.sort(function(a, b) {
    return b.rank - a.rank;
  });
  return list;
};