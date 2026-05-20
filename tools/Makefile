all: tz.bin

check:
	../node_modules/.bin/jshint pack.js

# get data

VERSION ?= 2026a
CULTURAL_URL = https://www.naturalearthdata.com/http//www.naturalearthdata.com/download/10m/cultural
CURL = curl --no-progress-meter --location

timezones.geojson.zip:
	$(CURL) --output $@ https://github.com/evansiroky/timezone-boundary-builder/releases/download/$(VERSION)/$@

ne_10m_urban_areas.zip:
	$(CURL) --output $@ $(CULTURAL_URL)/$@

.PRECIOUS: timezones.geojson.zip ne_10m_urban_areas.zip

combined.json: timezones.geojson.zip
	unzip $< $@
	touch $@ --reference $<

ne_10m_urban_areas.json: ne_10m_urban_areas.shp ne_10m_urban_areas.shx
	ogr2ogr -f GeoJSON $@ $<

# and, for good measure, populated places
%.shp: %.zip
	unzip $< $@
	touch --reference=$< $@

%.shx: %.zip
	unzip $< $@
	touch --reference=$< $@


tz_data.json: combined.json ne_10m_urban_areas.json
	node pack

tz.bin: tz_data.json
	node write

# -X option removes files specified in .gitignore
clean:
	git clean --force -X
