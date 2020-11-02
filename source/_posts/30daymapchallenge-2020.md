---
title:  "#30DayMapChallenge 2020"
date:   2020-11-01 00:00:00
thumbnail: day1.png
short: A map a day keeps November at bay.
---

# Intro

Last year I got drawn into the [#30DayMapChallenge](https://github.com/tjukanovt/30DayMapChallenge) and made it to day 19. I was pretty disorganized, didn't timebox my days, and had a couple double-map days. I'm not sure how much better this year will go, but I'm going to try and keep this page updated with the maps and methods throughout the month.

{% box map_challenge_themes_2020.jpg "30 Day Map Challenge Categories" %}

# Day 1: Points

{% box day1.png "Dot density/proportional symbol map recording parking violations in Brooklyn." %}

Data Sources
 - [Parking Violations Issued - Fiscal Year 2020](https://data.cityofnewyork.us/City-Government/Parking-Violations-Issued-Fiscal-Year-2020/p7t3-5i9s)
 - [LION Single Line Street Base Map](https://www1.nyc.gov/site/planning/data-maps/open-data/dwn-lion.page)

Tools
- QGIS
- PostgreSQL/PostGIS
- Photoshop

What a start! Wouldn't be a challenge without diving into some data. I love a good dot density map, many of which have been popping up since the challenge started. As with last year, it is tough not to be inspired by the content posted from those in time zones ahead. 

For today's map, I started surfing the NYC open data portal by [most recent datasets](https://data.cityofnewyork.us/browse?q=&sortBy=newest) which is where I found **Parking Violations Issued - Fiscal Year 2020**, though I would come to find this data contains way more than that. It comprises 43 columns and 12.5 million rows, with parking violations going back way further than 2020. One thing it is lacking though, is any sort of geocoded locations. Instead we're given "House Number", "Street" and "StreetCode1", "StreetCode2", "StreetCode3". Along with some other geo-identifying columns.

Note not all results shown for each query.

First I loaded it into Postgresql.

```sql
COPY parking 
FROM 'Parking_Violations_Issued_-_Fiscal_Year_2020.csv'
DELIMITER ','
CSV header;

SELECT count(*) from parking;
> 12,495,734
```

And running some fun fact queries, like which makes have the most tickets.

```sql
SELECT vehiclemake, count(*) FROM parking GROUP BY vehiclemake ORDER BY count(*) DESC;

vechiclemake, count
TOYOT	1395273
HONDA	1343265
FORD	1328063
NISSA	1119587
CHEVR	711464
FRUEH	530846
ME/BE	530473
JEEP	490977
BMW		488545
DODGE	462646
HYUND	357747
LEXUS	293752
ACURA	247954
INTER	231149
INFIN	230237
```

And then look a look at some rows related to location

```sql
SELECT vehiclemake, streetcode1, violationlocation, housenumber, streetname FROM parking LIMIT 5;

vehiclemake, streetcode1, violationlocation, housenumber, streetname
TOYOT	57310	52	3604	PAUL AVE
DODGE	0   	503	NULL 	KINGS COLLEGE AVE
TOYOT	23920	52	3505	DECATUR AVE
NISSA	23920	52	3505	DECATUR AVE
FORD	 0		52	18	VAN CORTLANDT AVE
```

After doing some Googling, it looks like "streetcode" is a reference to the [LION](https://www1.nyc.gov/site/planning/data-maps/open-data/dwn-lion.page) dataset, which contains all the streets in NYC. Downloaded that dataset (which happened to be a ArcGIS File Geodatabase), loaded it into QGIS and attempted to import into my local PostgreSQL (with the PostGIS extension of course). It failed due to the geometry containing both MultiLineString and MultiCurve shapes. No problem, ran "Multipart to Singleparts" in the QGIS processing toolbox and was off on my way.

A look at the LION street data, this time informed by a handy [metadata dictionary](https://www1.nyc.gov/assets/planning/download/pdf/data-maps/open-data/lion_metadata.pdf?r=20c). The dictionary let me know some things like the streetcode in the lion dataset starts with the borough code. And that "FromLeft" to "ToLeft" describe the street numbers contained on that geometry (similarly there is a "FromRight" to "ToRight").

```sql
SELECT count(*) FROM lion_single_parts;
> 229,208

SELECT "StreetCode", "Street", "FromLeft", "ToLeft" FROM lion_single_parts; 
435290	BEACH CHANNEL DRIVE	60001	61099
415990	76 STREET			69001	69099
439690	COOPER AVENUE		75001	75099
414890	71 AVENUE			75001	75099
457550	NORTH CONDUIT AVENUE90001	90099
```

In order to figure out how to join the streetcodes between these two datasets, I started with one example from the parking dataset and kept refining the query until I found the matching street. Lets use one of the examples above, **3604	PAUL AVE** with street code **57310**.

```sql
SELECT "StreetCode", "Street" FROM lion_single_parts WHERE "Street" LIKE '%PAUL AVE%';

"StreetCode", "Street"
266110	ST PAUL AVENUE	2007	2099
257310	PAUL AVENUE	    3591	3599
266110	ST PAUL AVENUE	2001	2005
257310	PAUL AVENUE	    3501    3589
257310	PAUL AVENUE	    0	    0
257310	PAUL AVENUE	    0	    0
257310	PAUL AVENUE	    0	    0
257310	PAUL AVENUE	    0	    0
257310	PAUL AVENUE	    0	    0
257310	PAUL AVENUE	    0	    0
257310	PAUL AVENUE	    3401	3499
257310	PAUL AVENUE	    3101	3399
```

Here we can see the code **57310** with the borough code **2** (Bronx) appended in front.

I decided I wanted to look just at Brooklyn parking violations in 2020, and made a handy table with the subset of those violations. One of the columns, "violationlocation", included a precinct number which could be filtered on to Brooklyn precincts (between 60 and 94).

```
CREATE table streetcodes as
SELECT streetcode1, streetcode2, streetcode3, housenumber, streetname, vehiclecolor, summonsnumber
FROPM parking 
WHERE violationlocation >= 60 AND violationlocation <= 94 AND streetcode1 <> '0' AND streetcode2 <> '0' AND streetcode3 <> '0'
AND issuedate like '%2020%';

SELECT count(*) FROM streetcodes;
> 565153
```

Now let's take a look at the number of violations per street.

```sql
SELECT streetname, st1."FromLeft", st1."ToLeft", count(*), st1.geom
FROM streetcodes, lion_single_parts as st1
WHERE '30' || streetcodes.streetcode1 = st1."StreetCode"
AND housenumber ~ E'^\\d+$'
AND (housenumber::integer between st1."FromLeft" AND "ToLeft")
GROUP BY st1.geom, st1."FromLeft", st1."ToLeft", streetname
ORDER BY count(*) desc;
```

It's at this point I learn my SQL browser ([Dbeaver](https://dbeaver.io/)) supports exporting tables in markdown. 

|streetname|FromLeft|ToLeft|count|geom|
|----------|--------|------|-----|----|
|9th St|309|375|1084|LINESTRING (988049.3131903708 183074.34281355143, 988704.4266214818 182658.4445938021)|
|13th Ave|4701|4799|359|LINESTRING (986760.1262291372 171041.54244202375, 986598.2860214412 170836.28363227844)|
|38th St|1201|1299|336|LINESTRING (987605.216469273 173362.79415227473, 988216.0877982825 172877.91662925482)|
|13th Ave|4601|4699|329|LINESTRING (986921.8352368176 171245.3182516992, 986760.1262291372 171041.54244202375)|
|5th Ave|7101|7199|319|LINESTRING (978317.2496281117 169742.54238031805, 978216.5444233418 169418.05476491153)|
|13th Ave|4001|4099|316|LINESTRING (987892.2825829089 172471.13260993361, 987731.4988752753 172265.2964001447)|
|9th St|241|307|306|LINESTRING (987399.3146594912 183493.9646334797, 988049.3131903708 183074.34281355143)|
|38th St|1301|1399|306|LINESTRING (988216.0877982825 172877.91662925482, 988828.8882273883 172394.2554062754)|
|13th Ave|3901|3999|301|LINESTRING (988054.470690608 172673.61901953816, 987892.2825829089 172471.13260993361)|

This makes sense, that block of 9th street is particularly busy and has a bus stops and bike lanes.

There is a problem though, I'm only going to know which stretch of street each parking violation is on. For a quick workaround I used [ST_LineInterpolatePoints](https://postgis.net/docs/ST_LineInterpolatePoints.html), using the house number as a rough proxy for distance along the street.

A bunch of fiddling later and...

the (almost) final query:

```
CREATE TABLE positions AS 
WITH streetcode AS (
	SELECT case 
		WHEN char_length(streetcode1) = 4 THEN '30' || streetcode1
		WHEN char_length(streetcode1) = 5 THEN '3' || streetcode1 
	   END AS streetcodes1, housenumber, vehiclecolor, summonsnumber
	FROM streetcodes
	WHERE housenumber ~ E'^\\d+$'
), pos AS (
	SELECT st1.geom AS geom, st1."FromLeft", st1."ToLeft", housenumber, vehiclecolor, summonsnumber,
		CASE WHEN st1."ToLeft" - st1."FromLeft" = 0 THEN 0 ELSE
			(housenumber::float - st1."FromLeft") / (st1."ToLeft" - st1."FromLeft")
		END AS norm_dist
	FROM streetcode, lion_single_parts as st1
	WHERE streetcodes1 = st1."StreetCode"
	AND (housenumber::integer between st1."FromLeft" AND "ToLeft")
)
SELECT ST_LineInterpolatePoints(geom, norm_dist, false) AS geom, vehiclecolor, summonsnumber
FROM pos;
```

I then opened the newly created **positions** table in QGIS. This resulted in a ton of points overlapping and I couldn't quiet figure out a good way to display them. Well why not throw in some porportional symbols then?

And finally another query - grouping by the geometry of each of those points in order to get a count of overlapping points.

```sql
SELECT geom, count(*)
FROM positions 
GROUP BY geom
ORDER BY count(*) desc;
```

I popped this final query into the QGIS Database Manager, threw on some styling to match the yellow of a parking violation, and there we have it. I skipped quite a few steps and directions I took while figuring this all out. If you have any questions feel free to reach out!

# Day 2: Lines

Coming soon...
