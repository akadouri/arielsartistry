---
title:  "NYC Pizza Routes"
date:   2018-08-01 21:31:51 -0800
thumbnail: pizza_routes.png
short: Routing to pizza places in NYC.
---

**10/5/18 This tutorial was also given as a talk at Maptime Seattle. [The google slides for that presentation is here.](https://docs.google.com/presentation/d/1geyx-BHge9Plb_QgeTQKw8G7HsPBBW8Iz4yBVs-7n9k/edit?usp=sharing) That presentation made use of PyQGIS but I haven't updated this tutorial yet to reflect that.**

{% box pizza_routes.png "Routes from Penn to Pizza" %}

The map above shows travel distances from Penn Station to 194 NYC pizza places. Made using PostGIS, pgRouting, QGIS, python, and with OpenStreetMap data.

# Introduction

A while ago I tried to find a tutorial for pgRouting on Mac OSX. I couldn't really find anything in one resource so after a weekend of fumbling through many tutorials I found managed to put together Pizza Map 1.0. I decided to put together this tutorial for anyone else interested in a routing crash course.

## Background knowledge 
This tutorial will assume comfort with terminal and some SQL, though you should still be able to make it through by copying and modifying the examples I provide. To aggregate many routes together the routes, the tutorial goes into using Python. If you have any questions, feel free to reach out. 

# Installation

There are a few different ways to install all the tools for this tutorial. I chose the following, mainly because they worked for me. Initially we'll install PostgreSQL, PostGIS, and pgRouting.

## Mac OSX

After briefly looking through some quick github issues, I found it would be easier to abandon [Postgres.app](https://postgresapp.com/) and instead install all the parts using [Homebrew](https://brew.sh/).  If you don't already have it, install Homebrew.

Then in terminal run   

```terminal
brew update
brew install postgresql
brew install postgis
brew install pgrouting
brew install interline-io/planetutils/osmctools
brew install osm2pgrouting
```

This should install also PostgreSQL and PostGIS as dependencies. Osmctools contains osmconvert, which we will use later to convert from .pbf to .osm.

## Windows

## Install PostgreSQL
Install PostgreSQL (I used v10.5) from [EnterpriseDB](https://www.enterprisedb.com/downloads/postgres-postgresql-downloads). Uncheck stackbuilder, we will not use pgAdmin (a graphical interface for PostgreSQL) either though you may want to use it later.

{% box setup1.png "Installation options for PostgreSQL" %}

You will need to set a password for the database superuser, please remember this password.

{% box setup2.png "Set a password for the postgres" %}

## Install PostGIS
Read about all the reasons you should use the OSGeo package, and all the things it comes with [here](https://postgis.net/windows_downloads/). 

After that install version 10 from [OSGeo's PostGIS Bundle](http://download.osgeo.org/postgis/windows/pg10/). Select the bundle marked **setup**. This bundle contains PostGIS, pgRouting, and osm2pgrouting. 

{% box setup3.png "Installation options for PostGIS" %}

Click **no** on the popups that occur during the installation refering to raster support.

## Install osmconvert
Download [osmconvert](https://wiki.openstreetmap.org/wiki/Osmconvert#Windows), the **binary for Windows 32 bit** version. Create a folder and place this file in your project folder.

# Download OpenStreetMap data

Using the handy OSM extract data on [HOT's Export Tool](https://export.hotosm.org/en/v3/). Any osm export service should do, they have a friendly interface for exporting data. 

If you would like the same export I used, [checkout this link](https://export.hotosm.org/en/v3/exports/841055f7-e5c3-4445-a074-2e3e9bdf6863).

If you make your own:
 
* Choose .pbf as your download file format.   
* Check 'Commerical' and 'Transportation' on the "Tag Tree".
* It may take a few minutes to create the export, they'll send you an email when it's done.

# Download QGIS

We'll use QGIS to put our maps together. [Download the latest version (3.2) via the standalone installer.](https://www.qgis.org/en/site/forusers/download.html) QGIS will come with Python as well. 

# Install Checklist
Please make sure you have done the following before [Maptime](https://www.meetup.com/MaptimeSEA/events/254009218/).

### Mac OSX
* Installed postgresql, pgrouting, osmctools, osm2pgrouting via homebrew
* Installed QGIS
* Have a folder with an OSM extract (ex. new-york-metro_export.pbf)

### Windows
* Installed PostgreSQL
* Installed PostGIS
* Installed QGIS
* Have a folder with
	* osmconvert.exe
	* an OSM extract (ex. new-york-metro_export.pbf)
	
# *Pre-Maptime Setup Stop.*

# Setting up PostgreSQL

## Mac OSX

To start PostgreSQL run the following command, replacing *path/to/workspace* with the folder you'd like PostgreSQL to store your data. If you'd like you can set this as an environment variable *PGDATA*. Read more on the [official docs.](https://www.postgresql.org/docs/current/static/server-start.html)

```terminal
pg_ctl -D /path/to/workspace start
```

Then enter psql, PostgreSQL's terminal interface, and create a new database with PostGIS enabled.

```terminal
psql postgres
```

## Windows

Open the SQL Shell that was bundled with EnterpriseDB's PostgreSQL installation. Press enter to use the default server, database, and port. Enter the password you came up with during installation. 

```terminal
Server [localhost]:
Database [postgres]:
Port [5432]:
Password for user postgres:
...
postgres=#
``` 

## Create the Database

In psql (terminal should have `postgres=#` on the left) we'll create a routing database, connect to it, and add the PostGIS & pgRouting extensions. Capitalization does not matter, I simply used it to emphasize psql keywords. 

```terminal
CREATE DATABASE routing;
\connect routing
CREATE EXTENSION postgis;
CREATE EXTENSION pgrouting;
CREATE EXTENSION hstore;
```

Check if the extensions where correctly installed by looking at the database's tables.

```terminal
\d
```
Should output:

```sql
List of relations
 Schema |       Name        | Type  | Owner
--------+-------------------+-------+-------
 public | geography_columns | view  | ariel
 public | geometry_columns  | view  | ariel
 public | raster_columns    | view  | ariel
 public | raster_overviews  | view  | ariel
 public | spatial_ref_sys   | table | ariel
(5 rows)
```

# Getting data into PostgreSQL 

### Download some OSM data

I found handy OSM extract data on [HOT's Export Tool](https://export.hotosm.org/en/v3/). Any osm data should do, they just have a friendly interface for exporting data. If you would like the same export I used, [checkout this link](https://export.hotosm.org/en/v3/exports/841055f7-e5c3-4445-a074-2e3e9bdf6863).

If you make your own:
 
* Choose .pbf as your download file format.   
* Check 'Commerical' and 'Transportation' on the "Tag Tree".
* It may take a few minutes to create the export, they'll send you an email when it's done.

Unfortunately, osm2pgrouting only accepts .osm files (xml) and .pbf files are an optimized version of that. 

### Using osmconvert

Run the following command to convert from .pbf to .osm (this will also remove some metadata tags from the file, which osm2pgrouting doesn't need): 

```terminal
osmconvert new-york-metro_export.pbf --drop-author --drop-version --out-osm -o=new-york-metro_export.osm
```

### Using osm2pgrouting

The data we're using has been extracted from OSM. This meant that we can use the handy [osm2pgrouting](https://github.com/pgRouting/osm2pgrouting) tool. You can download the tool from github and follow their installation instructions, install via homebrew (Mac), or install it via OSGeo's PostGIS bundle (Windows).

### mapconfig.xml
osm2pgrouting doesn't import all your osm data into PostgreSQL. It relies on what you tell it to import via the --conf parameter. Here we'll tell it to import anything that has the tag 'highway=...' and 'cuisine=pizza'. This is based on the [mapconfig\_for_cars.xml.](https://github.com/pgRouting/osm2pgrouting/blob/master/mapconfig_for_cars.xml)

Copy the following configuration file and save it as **mapconfig.xml** in your project folder.

```markup
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <tag_name name="highway" id="1">
    <tag_value name="motorway"          id="101" priority="1.0" maxspeed="130" />
    <tag_value name="motorway_link"     id="102" priority="1.0" maxspeed="130" />
    <tag_value name="motorway_junction" id="103" priority="1.0" maxspeed="130" />
    <tag_value name="trunk"             id="104" priority="1.05" maxspeed="110" />
    <tag_value name="trunk_link"        id="105" priority="1.05" maxspeed="110" />    
    <tag_value name="primary"           id="106" priority="1.15" maxspeed="90" />
    <tag_value name="primary_link"      id="107" priority="1.15" maxspeed="90" />    
    <tag_value name="secondary"         id="108" priority="1.5" maxspeed="90" />
    <tag_value name="secondary_link"    id="109" priority="1.5" maxspeed="90"/>  
    <tag_value name="tertiary"          id="110" priority="1.75" maxspeed="90" />
    <tag_value name="tertiary_link"     id="111" priority="1.75" maxspeed="90" />  
    <tag_value name="residential"       id="112" priority="2.5" maxspeed="50" />
    <tag_value name="living_street"     id="113" priority="3" maxspeed="20" />
    <tag_value name="service"           id="114" priority="2.5" maxspeed="50" />
    <tag_value name="unclassified"      id="117" priority="3" maxspeed="90"/>
    <tag_value name="road"              id="100" priority="5" maxspeed="50" />
  </tag_name>

  <tag_name name="cuisine" id="2">
    <tag_value name="pizza" id="201" />
  </tag_name> 
</configuration>
```

If you installed osm2pgrouting successfully, you should be able to run the following command (in terminal, outside of psql), which will begin importing your OSM data into PostgreSQL. 

```terminal
osm2pgrouting --f new-york-metro_export.osm --conf mapconfig.xml --dbname routing --username USERNAME --clean --addnodes
```

* the USERNAME is the one which invoked brew, which can be found on the "Owner" column through pqsl's `\d` command from earlier.

This process will take a while, osm2pgrouting loads all the data into memory and then inserts it into the database. 

### Check for data

Enter into psql again, and run a SELECT query on the newly created ways table.

```sql
psql routing
SELECT count(*) FROM ways;
```

For my data, the result was:

```sql
count
--------
 372974
(1 row)
```

You can see all the new tables with `\d`.
# Running pgRouting queries
This part is adapted from this [OSGeo](https://workshop.pgrouting.org/2.4.11/en/chapters/shortest_path.html) tutorial and the [pgRouting documentation](https://docs.pgrouting.org/latest/en/index.html).

We're going to build a query to find a route between two points, using their source or target IDs that were created by osm2pgrouting. These will appear in the "source" and "target" columns of the ways table. At this point, querying data in psql can become a little cumbersome. If you're going to continue working with PostgreSQL or databases in general, I recommend downloading [DBeaver](https://dbeaver.io/). 

*Note: my numbers may not necessarily match yours depending on your OSM extract and the order they were imported into the database.*

### Find the 'source' and 'target'
The source will be the road we route to all the pizza nodes from. To find the 'source' go to https://www.openstreetmap.org/ and find the way you'd like to route from. In my case I used the road in front of Penn Station, https://www.openstreetmap.org/way/195743190.

```sql
SELECT source
FROM ways 
WHERE osm_id = 195743190;
```
```sql
181766
```

Then we need to find a destination, or 'target'. You can open up OpenStreetMap again or select a "random" pizza node using the follow query.

```sql
SELECT *
FROM osm_nodes 
WHERE tag_value = 'pizza'
LIMIT 1;
```
```sql
2063693322	cuisine	pizza	CJ's	POINT (-74.0444971 40.8517183)
```

Now, our routing network relies on routing from ways to ways, not points to ways. We're going to need to find the nearest way to that pizza node.

```sql
SELECT source
FROM ways
ORDER BY ways.the_geom <-> (SELECT the_geom FROM osm_nodes WHERE osm_id = 2063693322 limit 10) 
LIMIT 1;
```

```sql
2,102
```
Now we can finally run a pgRouting query. We'll use [pgr_dijkstra](https://docs.pgrouting.org/2.3/en/src/dijkstra/doc/pgr_dijkstra.html#pgr-dijkstra).

```sql
SELECT *
FROM pgr_dijkstra('
	SELECT gid as id, source, target, length as cost 
	FROM ways',
	181766, 2102, false);
```

You should see a list of nodes, their edges, and the cost (distance) of the ways.

```terminal
1	1	181766	308044	0.0007495974657185707	0
2	2	29620	306514	0.0012048054830953953	0.0007495974657185705
3	3	44095	51609	0.0010462785288907173	0.001954402948813966
...
```

If we want to attach geometry to this route, join that route with the ways table.

```sql
SELECT *
FROM (SELECT * FROM pgr_dijkstra('
	SELECT gid as id, source, target, length as cost 
	FROM ways',
	181766, 2102, false)) as route, ways
WHERE route.edge = ways.gid;
```

```terminal
... LINESTRING (-73.9911207 40.7503112, -73.9911843 40.7502241, -73.9915006 40.7497913, -73.991563 40.749706)
...
```

# Visualizing your pgRoute in QGIS

{% box database_connection.png "Database connection configuration." %}

Open up QGIS. Go to Layer -> Add Layer -> Add PostGIS layer.
  
Click on "new" and enter *routing* as the Name.  
 
Enter *routing* as the database unless you entered something else earlier. Hit "OK" and then "connect". 

Open the "public" tab under schema and highlight "ways" and press add.  

This should add the ways (road network). 

{% box database_manager.png "Database manager configuration." %}

From the menu, open Database -> DB Manager -> DB Manager.

In the database manager, open PostGIS -> Routing -> public. 

From the menu, click on Database -> SQL Window (F2). 
 
Past the following query, with your source(181766)/target(2102) numbers. 

```sql
SELECT the_geom, agg_cost
FROM (SELECT * FROM pgr_dijkstra('
	SELECT gid as id, source, target, length as cost 
	FROM ways',
	181766, 2102, false)) as route, ways
WHERE route.edge = ways.gid;
```
Click Execute.

Now check "load as new layer." Make sure Geometry Column is checked and "the_geom" is selected.

Click Load.

A new "Query Layer" will be added to your map. The default style may blend in with the ways, so restyle it to check for the route.

{% box example_route.png "A single route." %}

*Note: QGIS fails to load query layers if you do not SELECT the geometry column.*

# Having more fun with python

In this next section, I'm going to use a python script to loop through all the pizza nodes and route to them. While this could probably also be done as a PostgreSQL function, I find it more practical to branch into python. Especially if you'd like to continue processing your data there. 

These next steps are also available as a [Jupyter Notebook on my github](https://github.com/akadouri/arielsartistry/tree/master/source/_posts/pizza-map/Tutorial%20Script.ipynb).

### [Psycopg](http://initd.org/psycopg/docs/usage.html)

Pyscopg is a handy python library that provides an API for accessing Postgresql. 

Import the libraries we'll use

```python
import psycopg2
import csv
```

Change user='' to your database username

```python
conn = psycopg2.connect("dbname=routing user=ariel")
cur = conn.cursor()
```

Find the "source" way. 
This will be the road we route to all the pizza nodes from. To find the 'source' go to https://www.openstreetmap.org/ and find the way you'd like to route from. In my case I used the road in front of Penn Station, https://www.openstreetmap.org/way/195743190.

```python
way_osm_id = 195743190
cur.execute("SELECT source FROM ways WHERE osm_id = %s", (way_osm_id,))
source = cur.fetchone()[0]
print("My source: " + str(source))
```

Get all the pizza nodes.

```python
cur.execute("SELECT * FROM osm_nodes WHERE tag_value = 'pizza'")
osm_ids = []
for record in cur:
    osm_ids.append(record[0])
    
print("We're going to route to: " + str(len(osm_ids)) + " pizza nodes.")
```

Find the closest streets to each pizza node.

```python
osm_ids_streets = []
for osm_id in osm_ids:
    cur.execute("SELECT source\
        FROM ways\
        ORDER BY ways.the_geom <-> (SELECT the_geom FROM osm_nodes WHERE osm_id = %s limit 10) limit 1;", (osm_id,))
    osm_ids_streets.append(cur.fetchone()[0])

print("We've got: " + str(len(osm_ids_streets)) + " nearest streets. Should be the same number as pizza nodes.")
```

This function will output each route to a csv file, which we can then load into QGIS.

```python
def writeRoute(route):
    print("writing route of length: " + str(len(route)))
    with open('routes.csv', 'a') as f:
        writer = csv.writer(f, lineterminator='\n')
        for r in route:
            writer.writerow(r)
```

Finally, loop through all the nearest streets to each pizza node and route to them from a common source. 
Tip: add a *break* to the loop and test just one route first!

```python
for osm_id in osm_ids_streets:
    cur.execute("select ST_AsText(the_geom), agg_cost from (SELECT * FROM pgr_dijkstra('\
        SELECT gid as id, source, target, length as cost\
        FROM ways',\
        %s, %s, false)) as x, ways where x.edge = ways.gid;", (source, osm_id,));
    writeRoute(cur.fetchall())
```

If you're not using the Jupyter notebook, put all the above code blocks into a single script.py and run. 

```python
python3 script.py
```

You should now have routes.csv, which has line segments and their agg_cost (aggregated distance from the source point).

{% box example_routes_100.png "An example map of 100 routes." %}

# Shutting down PostgreSQL

[Official doc](https://www.postgresql.org/docs/current/static/server-shutdown.html)

```terminal
pg_ctl stop
```

# Where to go from here
* The future is multimodal, but this tutorial only went over routing by cars. osm2pgrouting also has a mapconfig for bicycles and pedestrians. 
* I also only used Dijkstra's algorithm, but pgRouting has support for many other routing algorithms. 
* Consider a different analysis, or different focus area. Some areas have better OSM coverage than others. Instead of only looking for areas with great coverage, I think it can inspire OSM contributions if you focused on an area that was incomplete.


{% box example_with_basemap.png "An example map of overlaying a streets a basemap." %}

# Useful links & inspiration

* [osm2pgrouting github](https://github.com/pgRouting/osm2pgrouting)
* [pgRouting Offical Manual](http://docs.pgrouting.org/latest/en/index.html)
* [OS Geo quickstart](https://live.osgeo.org/en/quickstart/pgrouting_quickstart.html)
* [OS Geo shortest path tutorial](http://download.osgeo.org/pgrouting/foss4g2010/workshop/docs/html/chapters/shortest_path.html)
* [psycopg](http://initd.org/psycopg/)

# Questions, comments? 
Feel free to email me or message me on [twitter.](https://twitter.com/akadouri)
