/*
  Program to download map tiles from an online tileserver, and stitch images into a high-resolution image.

  The program creates a series of directories for each tile image, downloads each individual image, 
  and then stitches the images into a composite.
  There are four configurable parameters: 
    zoom level of the map [number from 1-14], 
    type [terrain, terrain-background, toner]
    bounds of map (latitude + longitude coordinates of desired map boundaries)
    download directory (name of folder directory to download images)
    filename (desired name for saved file)

  Dependencies: nodejs, graphicsmagick
*/

/*configurable variables*/
var MAP_ZOOM= 14;
var RIGHT_LON = -122.2;
var LEFT_LON = -122.6;
var TOP_LAT = 37.8012;
var BOTTOM_LAT = 37.6880;
var localDir = "./terrain";
var type = "terrain";
var outputFile = 'terrain.jpg'

/* Load required node modules*/
var gm = require('gm');
var request = require('request');
var fs = require('fs');
var mkdirp = require('mkdirp');

var minCol, minRow, maxCol, maxRow, zoomDirectory, fileLoc;

/*Urls of tile servers*/
var tileServers = {"terrain": "http://c.tile.stamen.com/terrain/", 
                  "terrain-background":  "http://c.tile.stamen.com/terrain-background/",
                  "toner": "http://c.tile.stamen.com/toner/", 
                  "watercolor": "http://c.tile.stamen.com/watercolor/"};

main();

function main(){
  fileLoc = tileServers[type];
  getTileCoords();
  zoomDirectory = localDir + "/" + MAP_ZOOM +"";//path to file for storing map at  given zoom level
  createDirectories(minCol, function(error){
      if(error) console.log(error);
      else loadTiles(minCol, minRow, function(error){
        if(error) console.log(error);
        else stitchImages(function(err){
          if(err){
            console.log(error);
          } else {
            console.log("made composite!");
            process.exit(code=0);
          }
        });
      });
  });
}

/*Calculate the tile numbers based off of given latitude and longitude. The conventions come from OpenStreetMap
http://wiki.openstreetmap.org/wiki/Slippy_map_tilenames */
function getTileCoords(){
  minRow = lat2tile(TOP_LAT, MAP_ZOOM);
  maxRow = lat2tile(BOTTOM_LAT, MAP_ZOOM)+1;
  minCol = long2tile(LEFT_LON, MAP_ZOOM);
  maxCol = long2tile(RIGHT_LON, MAP_ZOOM)+1;
}

/* utility functions for converting latitude and longitude based off of tile and zoom. */
function long2tile(lon,zoom) { return (Math.floor((lon+180)/360*Math.pow(2,zoom))); }
function lat2tile(lat,zoom)  { return (Math.floor((1-Math.log(Math.tan(lat*Math.PI/180) + 1/Math.cos(lat*Math.PI/180))/Math.PI)/2 *Math.pow(2,zoom)));}

/*Recursive function to create directories for storing downloaded tiles. a folder is create for each column of tiles*/
function createDirectories(col, callback){
  if(col > maxCol){
    callback(null);
  } else {
    var colDir = ""+zoomDirectory+"/"+col+"";
    mkdirp(colDir, function (err) {
      if (err) console.error(err);
      else createDirectories(col+1, callback);
   });
  }
}

/* Recursive function to download tiles by column*/
function loadTiles(col, row, callback){
  if(col > maxCol){
    callback(null);
  } else {
    loadColumn(col, row, function(err){
      if(err) callback(err);
      console.log("finished one column! "+ col);
      loadTiles(col+1, row, callback);
    });
  }
}

/* Recursive function to download a single column of map tiles, and save each tile into the
appropriate directory. Once the stream has finished writing an image, 
the function is called again with the row number incremented by 1. */
function loadColumn(col, row, callback){
  if(row >= maxRow){
   callback(null);
 } else {
   var colDir = ""+zoomDirectory+"/"+col+"";
   var filePath = "" + fileLoc + MAP_ZOOM+"/"+col+"/"+row+".jpg"; //remote location of tile
   var localPath = "" + colDir + "/" + row + ".jpg"; //local path to tile
   console.log(filePath + " , " + localPath);
   var r = request.get(filePath);
   var f = fs.createWriteStream(localPath);
   f.on("finish", function(){
    loadColumn(col, row+1, callback);
  });
   r.pipe(f);
   r.on("error", function(err){
      callback(err);
    });
 }

}


/*For each folder of images, combine the images into a single image(column) using graphicsmagic, 
and save the column by the column number*/
function stitchImages(callback){
    var colCount = minCol;
    for(var i = minCol; i <= maxCol; i++){
      var fileLoc = localDir+ "/" + MAP_ZOOM +"/" + i + "/"+ minRow + ".jpg";
      var nextLoc = minRow+1;
      var nextfileLoc = localDir+ "/" + MAP_ZOOM +"/" + i + "/"+ nextLoc + ".jpg";
      /* combine the first two tiles*/
      var comp = gm(fileLoc).append(nextfileLoc);
      /*continue appending images until the column is created*/
      var output = stitchedColumn(minRow+1, i, comp);
      var outputLoc = localDir + "/" + MAP_ZOOM + "/" + i + ".jpg";
      /*write the combined column image into the directory*/
      output.write(outputLoc, function(err, stdout, stderr, command){
        if (err){
          console.log('image conversion error!'); 
          console.log(err); 
          console.log(command);    
          callback(err);
        }else{ 
          colCount++;
          /*once all columns have been created, combine them*/
          if(colCount > maxCol) combineColumns(callback);              
      } 
    });
  }
}

/*Recursively append images until the entire column is created*/
function stitchedColumn(row, col, comp){
    row++;
    if(row >= maxRow) return comp;
    var fileLoc = localDir+ "/" + MAP_ZOOM +"/" + col + "/"+ row + ".jpg";
    return(stitchedColumn(row, col, comp.append(fileLoc)));
  }
  
/*Combine the columns into a single image*/
function combineColumns(callback){
    console.log("made cols!");
    var fileLoc = localDir+ "/" + MAP_ZOOM +"/" + minCol + ".jpg";
    var nextLoc = minCol+1;
    var nextfileLoc = localDir+ "/" + MAP_ZOOM +"/" + nextLoc + ".jpg";
    /* combine the first two columns*/
    var comp = gm(fileLoc).append(nextfileLoc, true);
     /*continue appending columns until the map is created*/
    var output = stitchedImage(nextLoc, comp);
    var outputLoc = localDir + "/" + outputFile ;
    output.write(outputLoc, function(err, stdout, stderr, command){
      if (err){
        console.log('image conversion error!'); 
        console.log(err); 
        console.log(command); 
        callback(err);   
      }else{  
        callback(null);
      } 
    });

  }

/*Recursively append columns until the entire image is created*/
  function stitchedImage(col, comp){
    col++;
    if(col >= maxCol) return comp;
    var fileLoc = localDir+ "/" + MAP_ZOOM +"/" + col + ".jpg";
    return(stitchedImage(col, comp.append(fileLoc)));

  }

  



  
  

 
