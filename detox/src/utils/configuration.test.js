const _ = require('lodash');
const path = require('path');
const schemes = require('./configurations.mock');

jest.mock('./argparse');

describe('configuration', () => {
  let args;
  let configuration;
  let detoxConfig;
  let deviceConfig;
  let userParams;

  beforeEach(() => {
    args = {};
    detoxConfig = {};
    deviceConfig = {};
    userParams = undefined;

    require('./argparse').getArgValue.mockImplementation(key => args[key]);
    configuration = require('./configuration');
  });

  describe('composeArtifactsConfig', () => {
    const composeArtifactsConfig = (...args) => configuration._internals.composeArtifactsConfig(...args);

    it('should produce a default config', () => {
      expect(composeArtifactsConfig({
        configurationName: 'abracadabra',
        deviceConfig: {},
        detoxConfig: {},
      })).toMatchObject({
        pathBuilder: expect.objectContaining({
          rootDir: expect.stringMatching(/^artifacts[\\\/]abracadabra\.\d{4}/),
        }),
        plugins: schemes.pluginsDefaultsResolved,
      });
    });

    it('should use artifacts config from the selected configuration', () => {
      expect(composeArtifactsConfig({
        configurationName: 'abracadabra',
        deviceConfig: {
          artifacts: {
            ...schemes.allArtifactsConfiguration,
            rootDir: 'otherPlace',
            pathBuilder: _.noop,
          }
        },
        detoxConfig: {},
      })).toMatchObject({
        pathBuilder: expect.objectContaining({
          rootDir: expect.stringMatching(/^otherPlace[\\\/]abracadabra\.\d{4}/),
        }),
        plugins: schemes.pluginsAllResolved,
      });
    });

    it('should use global artifacts config', () => {
      expect(composeArtifactsConfig({
        configurationName: 'abracadabra',
        deviceConfig: {},
        detoxConfig: {
          artifacts: {
            ...schemes.allArtifactsConfiguration,
            rootDir: 'otherPlace',
            pathBuilder: _.noop,
          }
        },
      })).toMatchObject({
        pathBuilder: expect.objectContaining({
          rootDir: expect.stringMatching(/^otherPlace[\\\/]abracadabra\.\d{4}/),
        }),
        plugins: schemes.pluginsAllResolved,
      });
    });

    it('should use CLI config', () => {
      Object.assign(args, {
        'artifacts-location': 'otherPlace',
        'record-logs': 'all',
        'take-screenshots': 'all',
        'record-videos': 'all',
        'record-performance': 'all',
        'record-timeline': 'all',
      });

      expect(composeArtifactsConfig({
        configurationName: 'abracadabra',
        deviceConfig: {},
        detoxConfig: {},
      })).toMatchObject({
        pathBuilder: expect.objectContaining({
          rootDir: expect.stringMatching(/^otherPlace[\\\/]abracadabra\.\d{4}/),
        }),
        plugins: schemes.pluginsAllResolved,
      });
    });

    it('should prefer CLI config over selected configuration over global config', () => {
      args['artifacts-location'] = 'cli';

      expect(composeArtifactsConfig({
        configurationName: 'priority',
        deviceConfig: {
          artifacts: {
            rootDir: 'configuration',
            pathBuilder: _.identity,
            plugins: {
              log: 'failing',
            },
          },
        },
        detoxConfig: {
          artifacts: {
            rootDir: 'global',
            pathBuilder: _.noop,
            plugins: {
              screenshot: 'all',
            },
          },
        },
      })).toMatchObject({
        pathBuilder: expect.objectContaining({
          rootDir: expect.stringMatching(/^cli[\\\/]priority\.\d{4}/),
        }),
        plugins: {
          log: schemes.pluginsFailingResolved.log,
          screenshot: schemes.pluginsAllResolved.screenshot,
          video: schemes.pluginsDefaultsResolved.video,
          instruments: schemes.pluginsDefaultsResolved.instruments,
          timeline: schemes.pluginsDefaultsResolved.timeline,
        },
      });
    });

    it('should resolve path builder from string (absolute path)', () => {
      const FakePathBuilder = require('../artifacts/__mocks__/FakePathBuilder');
      expect(composeArtifactsConfig({
        configurationName: 'customization',
        deviceConfig: {
          artifacts: {
            pathBuilder: path.join(__dirname, '../artifacts/__mocks__/FakePathBuilder')
          },
        },
        detoxConfig: {},
      }).pathBuilder).toBeInstanceOf(FakePathBuilder);
    });

    it('should resolve path builder from string (relative path)', () => {
      expect(composeArtifactsConfig({
        configurationName: 'customization',
        deviceConfig: {
          artifacts: {
            pathBuilder: './package.json',
          },
        },
        detoxConfig: {},
      })).toMatchObject({
        pathBuilder: expect.objectContaining({
          "name": expect.any(String),
          "version": expect.any(String),
        }),
      });
    });

    it('should not append configuration with timestamp if rootDir ends with slash', () => {
      expect(composeArtifactsConfig({
        configurationName: 'customization',
        deviceConfig: {
          artifacts: {
            rootDir: '.artifacts/'
          },
        },
        detoxConfig: {},
      })).toMatchObject({
        rootDir: '.artifacts/',
      });
    });

    it('should allow passing custom plugin configurations', () => {
      args['take-screenshots'] = 'all';

      expect(composeArtifactsConfig({
        configurationName: 'custom',
        detoxConfig: {
          artifacts: {
            rootDir: 'configuration',
            pathBuilder: _.identity,
            plugins: {
              screenshot: {
                takeWhen: {
                  testDone: true,
                },
              },
              video: {
                android: { bitRate: 4000000 },
                simulator: { codec: "hevc" },
              }
            },
          },
        },
        deviceConfig: {},
      })).toMatchObject({
        plugins: expect.objectContaining({
          screenshot: {
            ...schemes.pluginsAllResolved.screenshot,
            takeWhen: {
              testDone: true,
            },
          },
          video: {
            ...schemes.pluginsDefaultsResolved.video,
            android: { bitRate: 4000000 },
            simulator: { codec: "hevc" },
          },
        }),
      });
    });
  });

  describe('composeBehaviorConfig', () => {
    const composeBehaviorConfig = (...args) => configuration._internals.composeBehaviorConfig(...args);

    let composed = () => composeBehaviorConfig({
      deviceConfig,
      detoxConfig,
      userParams,
    });

    it('should return a default behavior if nothing is set', () => {
      expect(composed()).toEqual({
        init: {
          exposeGlobals: true,
          reinstallApp: true,
          launchApp: true,
        },
        cleanup: {
          shutdownDevice: false,
        },
      })
    });

    describe('if detox config is set', () => {
      beforeEach(() => {
        detoxConfig = {
          behavior: {
            init: {
              exposeGlobals: false,
              reinstallApp: false,
              launchApp: false,
            },
            cleanup: {
              shutdownDevice: true,
            },
          },
        };
      });

      it('should override the defaults', () => {
        const expected = _.cloneDeep(detoxConfig.behavior);
        const actual = composed();

        expect(actual).toEqual(expected);
      });

      describe('if device config is set', () => {
        beforeEach(() => {
          deviceConfig = {
            behavior: {
              init: {
                exposeGlobals: true,
                reinstallApp: true,
                launchApp: true,
              },
              cleanup: {
                shutdownDevice: false,
              },
            },
          };
        });

        it('should override the defaults from detox config', () => {
          const expected = _.cloneDeep(deviceConfig.behavior);
          const actual = composed();

          expect(actual).toEqual(expected);
        });

        describe('if user params is set', () => {
          beforeEach(() => {
            userParams = {
              initGlobals: false,
              launchApp: false,
              reuse: false,
            };
          });

          it('should override the defaults from device config', () => {
            expect(composed()).toEqual({
              init: {
                exposeGlobals: false,
                reinstallApp: true,
                launchApp: false,
              },
              cleanup: {
                shutdownDevice: false,
              }
            });
          });

          describe('if cli args are set', () => {
            beforeEach(() => {
              args.reuse = true;
              args.cleanup = true;
            });

            it('should override the user params', () => {
              expect(composed()).toEqual({
                init: {
                  exposeGlobals: false,
                  reinstallApp: false,
                  launchApp: false,
                },
                cleanup: {
                  shutdownDevice: true,
                }
              });
            });
          });
        });
      });
    });
  });

  describe('composeDeviceConfig', () => {
    const composeDeviceConfig = (...args) => configuration._internals.composeDeviceConfig(...args);

    let configs;

    beforeEach(() => {
      configs = [1, 2].map(i => ({
        type: `someDriver${i}`,
        device: `someDevice${i}`,
      }));
    });

    describe('validation', () => {
      it('should throw if no configurations are passed', () => {
        expect(() => composeDeviceConfig({
          configurations: {},
        })).toThrowError(/There are no device configurations/);
      });

      it('should throw if configuration driver (type) is not defined', () => {
        expect(() => composeDeviceConfig({
          configurations: {
            undefinedDriver: {
              device: { type: 'iPhone X' },
            },
          },
        })).toThrowError(/type.*missing.*ios.simulator.*android.emulator/);
      });

      it('should throw if device query is not defined', () => {
        expect(() => composeDeviceConfig({
          configurations: {
            undefinedDeviceQuery: {
              type: 'ios.simulator',
            },
          },
        })).toThrowError(/device.*empty.*device.*query.*type.*avdName/);
      });
    });

    describe('for no specified configuration name', () => {
      beforeEach(() => { delete args.configuration; });

      describe('when there is a single config', () => {
        it('should return it', () => {
          const singleDeviceConfig = configs[0];

          expect(composeDeviceConfig({
            configurations: {singleDeviceConfig }
          })).toBe(singleDeviceConfig);
        });
      });

      describe('when there is more than one config', () => {
        it('should throw if there is more than one config', () => {
          const [config1, config2] = configs;
          expect(() => composeDeviceConfig({
            configurations: { config1, config2 },
          })).toThrowError(/Cannot determine/);
        });

        describe('but also selectedConfiguration param is specified', () => {
          it('should select that configuration', () => {
            const [config1, config2] = configs;

            expect(composeDeviceConfig({
              selectedConfiguration: 'config1',
              configurations: { config1, config2 },
            })).toEqual(config1);
          });
        });
      });
    });

    describe('for a specified configuration name', () => {
      let sampleConfigs;

      beforeEach(() => {
        args.configuration = 'config2';

        const [config1, config2] = [1, 2].map(i => ({
          type: `someDriver${i}`,
          device: `someDevice${i}`,
        }));

        sampleConfigs = { config1, config2 };
      });

      it('should return that config', () => {
        expect(composeDeviceConfig({
          configurations: sampleConfigs
        })).toEqual(sampleConfigs.config2);
      });

      describe('if device-name override is present', () => {
        beforeEach(() => { args['device-name'] = 'Override'; });

        it('should return that config with an overriden device query', () => {
          expect(composeDeviceConfig({
            configurations: sampleConfigs
          })).toEqual({
            ...sampleConfigs.config2,
            device: 'Override',
          });
        });
      })
    });
  });

  describe('composeSessionConfig', () => {
    const composeSessionConfig = (...args) => configuration._internals.composeSessionConfig(...args);

    const compose = () => composeSessionConfig({
      detoxConfig,
      deviceConfig,
    });

    it('should generate a default config', async () => {
      const sessionConfig = await compose();

      expect(sessionConfig).toMatchObject({
        autoStart: true,
        server: expect.stringMatching(/^ws:.*localhost:/),
        sessionId: expect.stringMatching(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i),
      });
    });

    describe('if detoxConfig.session is defined', function() {
      beforeEach(() => {
        detoxConfig.session = {
          server: 'ws://localhost:9999',
          sessionId: 'someSessionId',
        };
      })

      it('should return detoxConfig.session', async () => {
        expect(await compose()).toEqual({
          server: 'ws://localhost:9999',
          sessionId: 'someSessionId',
        });
      });

      test(`providing empty server config should throw`, () => {
        delete detoxConfig.session.server;
        expect(compose()).rejects.toThrowError(/session.server.*missing/);
      });

      test(`providing server config with no session should throw`, () => {
        delete detoxConfig.session.sessionId;
        expect(compose()).rejects.toThrowError(/session.sessionId.*missing/);
      });

      describe('if deviceConfig.session is defined', function() {
        beforeEach(() => {
          detoxConfig.session = {
            server: 'ws://localhost:1111',
            sessionId: 'anotherSession',
          };
        });

        it('should return deviceConfig.session instead of detoxConfig.session', async () => {
          expect(await compose()).toEqual({
            server: 'ws://localhost:1111',
            sessionId: 'anotherSession',
          });
        });
      });
    });
  });

  describe('composeDetoxConfig', () => {
    it('should throw if no config given', async () => {
      await expect(configuration.composeDetoxConfig({})).rejects.toThrowError(
        /Cannot start Detox without a configuration/
      );
    });

    it('should implicitly use package.json config if it has "detox" section', async () => {
      const config = await configuration.composeDetoxConfig({
        cwd: path.join(__dirname, '__mocks__/configuration/priority'),
      });

      expect(config).toMatchObject({
        deviceConfig: expect.objectContaining({
          device: 'Hello from package.json',
        }),
      });
    });

    it('should implicitly use .detoxrc if package.json has no "detox" section', async () => {
      const config = await configuration.composeDetoxConfig({
        cwd: path.join(__dirname, '__mocks__/configuration/detoxrc')
      });

      expect(config).toMatchObject({
        deviceConfig: expect.objectContaining({
          device: 'Hello from .detoxrc',
        }),
      });
    });

    it('should explicitly use the specified config (via env-cli args)', async () => {
      args['config-path'] = path.join(__dirname, '__mocks__/configuration/priority/detox-config.json');
      const config = await configuration.composeDetoxConfig({});

      expect(config).toMatchObject({
        deviceConfig: expect.objectContaining({
          device: 'Hello from detox-config.json',
        }),
      });
    });

    it('should throw if explicitly given config is not found', async () => {
      args['config-path'] = path.join(__dirname, '__mocks__/configuration/non-existent.json');

      await expect(configuration.composeDetoxConfig({})).rejects.toThrowError(
        /ENOENT: no such file.*non-existent.json/
      );
    });

    it('should return a complete Detox config merged with the file configuration', async () => {
      const config = await configuration.composeDetoxConfig({
        cwd: path.join(__dirname, '__mocks__/configuration/detoxrc'),
        selectedConfiguration: 'another',
        override: {
          configurations: {
            another: {
              type: 'ios.simulator',
              device: 'iPhone X',
            },
          },
        }
      });

      expect(config).toMatchObject({
        artifactsConfig: expect.objectContaining({}),
        behaviorConfig: expect.objectContaining({}),
        deviceConfig: expect.objectContaining({
          type: 'ios.simulator',
          device: 'iPhone X',
        }),
        sessionConfig: expect.objectContaining({
          server: 'ws://localhost:9999',
          sessionId: 'external file works',
        }),
      });
    });
  });

  describe('throwOnBinaryPath', () => {
    it('should throw an error', () => {
      expect(() => configuration.throwOnEmptyBinaryPath()).toThrowError(
        /binaryPath.*missing/
      );
    })
  })
});
